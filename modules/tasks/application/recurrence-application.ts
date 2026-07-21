import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database, DatabaseTransaction } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";
import { ianaTimeZoneSchema } from "@/shared/validation/time-zone";

import {
  editRecurringTaskScheduleRequestSchema,
  endTaskRecurrenceRequestSchema,
  setTaskRecurrenceRequestSchema,
  taskRecurrenceMutationResultSchema,
  type EditRecurringTaskScheduleRequest,
  type EndTaskRecurrenceRequest,
  type RecurrenceDefinition,
  type SetTaskRecurrenceRequest,
  type TaskRecurrenceDto,
  type TaskRecurrenceMutationResult,
} from "./contracts/recurrence-contract";
import { noopTaskReminderReconciler, type TaskReminderReconciler } from "./contracts/task-reminder-contract";
import { entityIdSchema, versionedResourceReferenceSchema } from "./contracts/contract-primitives";
import {
  createRecurrenceWrite,
  initialProjection,
  mapTaskRecurrence,
  nextFutureOccurrenceStart,
  parseStoredRecurrence,
  toRecurrenceAnchor,
  type UserTimezoneResolver,
} from "./recurrence-application-support";
import type { RecurrenceExpansionPort } from "./recurrence-expansion-port";
import { runReminderRelevantTaskTransaction } from "./reminder-relevant-transaction";
import { toScheduleWrite } from "./schedule-application";
import { assertMutableTask, requireAppliedTask } from "./task-application-support";
import { taskConflict, taskResourceNotFound, taskValidationFailure } from "./task-errors";
import { createPostgresTaskReadSnapshot, type TaskReadSnapshot } from "./task-read-snapshot";
import {
  endRecurrenceProjection,
  fallbackEndCutover,
  restartRecurrenceProjection,
} from "../domain/recurrence/recurrence-cutover-policy";
import type { RecurrenceScheduleAnchor } from "../domain/recurrence/recurrence-time-policy";
import { createTaskRecurrenceRepository } from "../infrastructure/task-recurrence-repository";
import {
  createTaskScheduleRepository,
  type StoredTaskSchedule,
} from "../infrastructure/task-schedule-repository";
import { createTaskRepository, type StoredTask } from "../infrastructure/task-repository";
import type { TaskScheduleTable } from "../infrastructure/schema";

type RecurrenceApplicationDependencies = Readonly<{
  database: Database;
  clock: Clock;
  taskSchedules: TaskScheduleTable;
  expansion: RecurrenceExpansionPort;
  resolveUserTimezone: UserTimezoneResolver;
  reminderReconciler?: TaskReminderReconciler;
  snapshot?: TaskReadSnapshot;
}>;

export function createTaskRecurrenceApplication(dependencies: RecurrenceApplicationDependencies) {
  const { database, clock, expansion, resolveUserTimezone } = dependencies;
  const reminderReconciler = dependencies.reminderReconciler ?? noopTaskReminderReconciler;
  const tasks = createTaskRepository(database);
  const schedules = createTaskScheduleRepository(dependencies.taskSchedules, database);
  const recurrences = createTaskRecurrenceRepository(database);
  const snapshot = dependencies.snapshot ?? createPostgresTaskReadSnapshot(database);

  async function getRecurrence(
    actor: AuthenticatedActor,
    rawTaskId: string,
  ): Promise<TaskRecurrenceDto | null> {
    const taskId = entityIdSchema.parse(rawTaskId);
    return snapshot.run(async (transaction) => {
      const task = await tasks.findById(actor.userId, taskId, "any", transaction);
      if (!task) throw taskResourceNotFound();
      const recurrence = await recurrences.findByTaskId(actor.userId, taskId, transaction);
      if (!recurrence) return null;
      const schedule = await schedules.findByTaskId(actor.userId, taskId, transaction);
      if (!schedule) throw new Error("A stored recurrence must have a schedule.");
      return mapTaskRecurrence(task, schedule, recurrence, expansion, clock.now());
    });
  }

  async function createOrEditRecurrence(
    actor: AuthenticatedActor,
    rawTaskId: string,
    rawInput: SetTaskRecurrenceRequest,
  ): Promise<TaskRecurrenceMutationResult> {
    const taskId = entityIdSchema.parse(rawTaskId);
    const input = setTaskRecurrenceRequestSchema.parse(rawInput);
    // The schedule kind is protected by the aggregate lock, so resolve the actor's saved
    // all-day timezone before acquiring a tasks transaction. Timed schedules ignore it.
    const savedTimeZone = ianaTimeZoneSchema.parse(await resolveUserTimezone(actor));
    return runReminderRelevantTaskTransaction({
      actor,
      database,
      prepareTaskIds: [taskId],
      reconciler: reminderReconciler,
      execute: async (transaction) => {
        const locked = await lockRecurringAggregate(actor, taskId, input.expectedVersion, transaction);
        const timezone =
          locked.schedule.kind === "all_day" ? savedTimeZone : requiredScheduleTimezone(locked.schedule);
        const anchor = recurrenceDomainCall(() => toRecurrenceAnchor(locked.schedule, timezone));
        const initial = initialProjection(anchor);
        const now = clock.now();
        const nextStart = requireFutureCandidate(input.definition, anchor, initial, now);
        const projection = locked.recurrence
          ? restartRecurrenceProjection(
              parseStoredRecurrence(locked.recurrence, locked.schedule).projection,
              nextStart,
            )
          : initial;
        const value = await persistRecurrenceMutation(
          actor,
          locked.task,
          locked.recurrence === null ? "insert" : "replace",
          input.definition,
          anchor,
          projection,
          input.expectedVersion,
          now,
          transaction,
        );
        await reminderReconciler.applyRecurrenceResolution(
          actor,
          { taskId, resolution: input.reminderResolution },
          transaction,
        );
        return { value, change: { taskIds: [taskId], reason: "schedule_changed" } };
      },
    });
  }

  async function editRecurringSchedule(
    actor: AuthenticatedActor,
    rawTaskId: string,
    rawInput: EditRecurringTaskScheduleRequest,
  ): Promise<TaskRecurrenceMutationResult> {
    const taskId = entityIdSchema.parse(rawTaskId);
    const input = editRecurringTaskScheduleRequestSchema.parse(rawInput);
    const allDayTimeZone =
      input.schedule.kind === "all_day" ? ianaTimeZoneSchema.parse(await resolveUserTimezone(actor)) : null;
    return runReminderRelevantTaskTransaction({
      actor,
      database,
      prepareTaskIds: [taskId],
      reconciler: reminderReconciler,
      execute: async (transaction) => {
        const locked = await lockRecurringAggregate(actor, taskId, input.expectedVersion, transaction);
        if (!locked.recurrence) {
          throw taskConflict("This task does not have a recurrence rule.", locked.task.version);
        }
        if (input.schedule.kind !== locked.schedule.kind) {
          throw taskValidationFailure(
            "A recurring schedule must keep its all-day or specific-time type to preserve occurrence history.",
          );
        }
        const timezone =
          input.schedule.kind === "all_day" ? requiredTimeZone(allDayTimeZone) : input.schedule.timezone;
        const anchor = recurrenceDomainCall(() => toRecurrenceAnchor(input.schedule, timezone));
        const baseProjection = initialProjection(anchor);
        const now = clock.now();
        const nextStart = requireFutureCandidate(input.definition, anchor, baseProjection, now);
        const projection = restartRecurrenceProjection(baseProjection, nextStart);
        const storedSchedule = await schedules.upsert(
          {
            userId: actor.userId,
            taskId,
            schedule: toScheduleWrite(input.schedule),
            now,
          },
          transaction,
        );
        const value = await persistRecurrenceMutation(
          actor,
          locked.task,
          "replace",
          input.definition,
          anchor,
          projection,
          input.expectedVersion,
          now,
          transaction,
          storedSchedule,
        );
        await reminderReconciler.applyRecurrenceResolution(
          actor,
          { taskId, resolution: input.reminderResolution },
          transaction,
        );
        return { value, change: { taskIds: [taskId], reason: "schedule_changed" } };
      },
    });
  }

  async function endRecurrence(
    actor: AuthenticatedActor,
    rawTaskId: string,
    rawInput: EndTaskRecurrenceRequest,
  ): Promise<TaskRecurrenceMutationResult> {
    const taskId = entityIdSchema.parse(rawTaskId);
    const input = endTaskRecurrenceRequestSchema.parse(rawInput);
    return runReminderRelevantTaskTransaction({
      actor,
      database,
      prepareTaskIds: [taskId],
      reconciler: reminderReconciler,
      execute: async (transaction) => {
        const locked = await lockRecurringAggregate(actor, taskId, input.expectedVersion, transaction);
        if (!locked.recurrence) {
          throw taskConflict("This task does not have a recurrence rule.", locked.task.version);
        }
        const parsed = recurrenceDomainCall(() => parseStoredRecurrence(locked.recurrence!, locked.schedule));
        if (hasUpperCutover(parsed.projection)) {
          throw taskConflict("This recurrence has already ended.", locked.task.version);
        }
        const now = clock.now();
        const upper = recurrenceDomainCall(
          () =>
            nextFutureOccurrenceStart(expansion, parsed.definition, parsed.anchor, parsed.projection, now) ??
            fallbackEndCutover(parsed.projection.kind, now.toISOString(), parsed.anchor.timezone),
        );
        const ended = recurrenceDomainCall(() => endRecurrenceProjection(parsed.projection, upper));
        const value = await persistRecurrenceMutation(
          actor,
          locked.task,
          "replace",
          parsed.definition,
          parsed.anchor,
          ended,
          input.expectedVersion,
          now,
          transaction,
        );
        return { value, change: { taskIds: [taskId], reason: "schedule_changed" } };
      },
    });
  }

  async function lockRecurringAggregate(
    actor: AuthenticatedActor,
    taskId: string,
    expectedVersion: number,
    transaction: DatabaseTransaction,
  ) {
    const task = await tasks.lockById(actor.userId, taskId, "any", transaction);
    assertMutableRecurringOwner(task, expectedVersion);
    const recurrence = await recurrences.lockByTaskId(actor.userId, taskId, transaction);
    const schedule = await schedules.lockByTaskId(actor.userId, taskId, transaction);
    if (!schedule) throw taskValidationFailure("Schedule this task before adding recurrence.");
    return { task, recurrence, schedule } as const;
  }

  async function persistRecurrenceMutation(
    actor: AuthenticatedActor,
    task: StoredTask,
    mode: "insert" | "replace",
    definition: RecurrenceDefinition,
    anchor: RecurrenceScheduleAnchor,
    projection: ReturnType<typeof initialProjection>,
    expectedVersion: number,
    now: Date,
    transaction: DatabaseTransaction,
    persistedSchedule?: StoredTaskSchedule,
  ): Promise<TaskRecurrenceMutationResult> {
    const write = recurrenceDomainCall(() => createRecurrenceWrite(definition, anchor, projection));
    const recurrence = await recurrences[mode](
      { userId: actor.userId, taskId: task.id, recurrence: write, now },
      transaction,
    );
    if (!recurrence) {
      throw taskConflict(
        mode === "insert"
          ? "This task already has a recurrence rule."
          : "This task no longer has a recurrence rule.",
        task.version,
      );
    }
    const updated = requireAppliedTask(
      await tasks.incrementVersion({ userId: actor.userId, id: task.id, expectedVersion, now }, transaction),
    );
    const schedule = persistedSchedule ?? (await schedules.findByTaskId(actor.userId, task.id, transaction));
    if (!schedule) throw new Error("A stored recurrence must have a schedule.");
    return taskRecurrenceMutationResultSchema.parse({
      task: versionedResourceReferenceSchema.parse({ id: updated.id, version: updated.version }),
      recurrence: mapTaskRecurrence(updated, schedule, recurrence, expansion, now),
    });
  }

  function requireFutureCandidate(
    definition: RecurrenceDefinition,
    anchor: RecurrenceScheduleAnchor,
    projection: ReturnType<typeof initialProjection>,
    now: Date,
  ) {
    const next = recurrenceDomainCall(() =>
      nextFutureOccurrenceStart(expansion, definition, anchor, projection, now),
    );
    if (!next) {
      throw taskValidationFailure("The recurrence end condition has no future occurrence.");
    }
    return next;
  }

  return {
    getRecurrence,
    setRecurrence: createOrEditRecurrence,
    createOrEditRecurrence,
    editRecurringSchedule,
    endRecurrence,
  } as const;
}

function assertMutableRecurringOwner(
  task: StoredTask | null,
  expectedVersion: number,
): asserts task is StoredTask {
  assertMutableTask(task, expectedVersion);
  if (task.status !== "open") {
    throw taskConflict("Only an open task can have an active recurrence.", task.version);
  }
  if (task.parentTaskId !== null) {
    throw taskValidationFailure("Only a root task can have a recurrence rule.");
  }
}

function requiredScheduleTimezone(schedule: StoredTaskSchedule): string {
  if (schedule.kind !== "timed" || schedule.timezone === null) {
    throw new Error("A stored timed schedule must have a timezone.");
  }
  return schedule.timezone;
}

function requiredTimeZone(value: string | null): string {
  if (value === null) throw new Error("An all-day recurrence requires the actor's saved timezone.");
  return value;
}

function hasUpperCutover(projection: ReturnType<typeof initialProjection>): boolean {
  return projection.kind === "all_day"
    ? projection.projectionEndDate !== null
    : projection.projectionEndAt !== null;
}

function recurrenceDomainCall<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof RangeError) throw taskValidationFailure(error.message);
    throw error;
  }
}
