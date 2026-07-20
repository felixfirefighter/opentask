import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database, DatabaseTransaction } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

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
import { toScheduleWrite } from "./schedule-application";
import { assertMutableTask, requireAppliedTask } from "./task-application-support";
import { taskConflict, taskResourceNotFound, taskValidationFailure } from "./task-errors";
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
}>;

export function createTaskRecurrenceApplication(dependencies: RecurrenceApplicationDependencies) {
  const { database, clock, expansion, resolveUserTimezone } = dependencies;
  const tasks = createTaskRepository(database);
  const schedules = createTaskScheduleRepository(dependencies.taskSchedules, database);
  const recurrences = createTaskRecurrenceRepository(database);

  async function getRecurrence(
    actor: AuthenticatedActor,
    rawTaskId: string,
  ): Promise<TaskRecurrenceDto | null> {
    const taskId = entityIdSchema.parse(rawTaskId);
    const task = await tasks.findById(actor.userId, taskId, "any");
    if (!task) throw taskResourceNotFound();
    const recurrence = await recurrences.findByTaskId(actor.userId, taskId);
    if (!recurrence) return null;
    const schedule = await schedules.findByTaskId(actor.userId, taskId);
    if (!schedule) throw new Error("A stored recurrence must have a schedule.");
    return mapTaskRecurrence(task, schedule, recurrence, expansion, clock.now());
  }

  async function createOrEditRecurrence(
    actor: AuthenticatedActor,
    rawTaskId: string,
    rawInput: SetTaskRecurrenceRequest,
  ): Promise<TaskRecurrenceMutationResult> {
    const taskId = entityIdSchema.parse(rawTaskId);
    const input = setTaskRecurrenceRequestSchema.parse(rawInput);
    return database.transaction(async (transaction) => {
      const locked = await lockRecurringAggregate(actor, taskId, input.expectedVersion, transaction);
      const timezone =
        locked.schedule.kind === "all_day"
          ? await resolveUserTimezone(actor, transaction)
          : requiredScheduleTimezone(locked.schedule);
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
      return persistRecurrenceMutation(
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
    });
  }

  async function editRecurringSchedule(
    actor: AuthenticatedActor,
    rawTaskId: string,
    rawInput: EditRecurringTaskScheduleRequest,
  ): Promise<TaskRecurrenceMutationResult> {
    const taskId = entityIdSchema.parse(rawTaskId);
    const input = editRecurringTaskScheduleRequestSchema.parse(rawInput);
    return database.transaction(async (transaction) => {
      const locked = await lockRecurringAggregate(actor, taskId, input.expectedVersion, transaction);
      if (!locked.recurrence) {
        throw taskConflict("This task does not have a recurrence rule.", locked.task.version);
      }
      const timezone =
        input.schedule.kind === "all_day"
          ? await resolveUserTimezone(actor, transaction)
          : input.schedule.timezone;
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
      return persistRecurrenceMutation(
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
    });
  }

  async function endRecurrence(
    actor: AuthenticatedActor,
    rawTaskId: string,
    rawInput: EndTaskRecurrenceRequest,
  ): Promise<TaskRecurrenceMutationResult> {
    const taskId = entityIdSchema.parse(rawTaskId);
    const input = endTaskRecurrenceRequestSchema.parse(rawInput);
    return database.transaction(async (transaction) => {
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
      return persistRecurrenceMutation(
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
