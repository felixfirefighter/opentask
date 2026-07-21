import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { DatabaseTransaction } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";
import { ianaTimeZoneSchema } from "@/shared/validation/time-zone";

import {
  reviewedPlanBatchSchema,
  taskOccurrenceRangeQuerySchema,
  taskSnapshotIdSelectionSchema,
  type BoundedTaskOccurrencePage,
  type ReviewedPlanBatch,
  type ReviewedPlanBusyIntervalRequest,
  type ReviewedPlanTaskSnapshot,
  type ReviewedPlanTaskWriter,
  type TaskScheduleValue,
  noopTaskReminderReconciler,
  normalizeReminderTaskIds,
  type TaskReminderReconciler,
} from "./contracts";
import { generateRanksBetween } from "./ranking";
import { createBoundedOccurrenceSnapshotReader } from "./occurrence-reader";
import type { RecurrenceExpansionPort } from "./recurrence-expansion-port";
import { mapSchedule } from "./schedule-application";
import { assertMutableTask, requireAppliedTask, taskRankLockScope } from "./task-application-support";
import { taskConflict, taskResourceNotFound } from "./task-errors";
import { normalizeTaskTitle, validateTaskDescription } from "../domain/task-text";
import { createReviewedPlanRepository } from "../infrastructure/reviewed-plan-repository";
import { createTaskRecurrenceRepository } from "../infrastructure/task-recurrence-repository";
import type { TaskScheduleTable } from "../infrastructure/schema";
import { lockRankScope } from "../infrastructure/rank-scope-lock";
import { createTaskRepository, type StoredTask } from "../infrastructure/task-repository";
import {
  createTaskScheduleRepository,
  type ScheduleWriteValue,
} from "../infrastructure/task-schedule-repository";

export function createReviewedPlanTaskWriter({
  clock,
  taskSchedules,
  recurrenceExpansion,
  reminderReconciler = noopTaskReminderReconciler,
}: {
  clock: Clock;
  taskSchedules: TaskScheduleTable;
  recurrenceExpansion: RecurrenceExpansionPort;
  reminderReconciler?: TaskReminderReconciler;
}): ReviewedPlanTaskWriter {
  const repository = createReviewedPlanRepository(taskSchedules);
  const tasks = createTaskRepository();
  const recurrences = createTaskRecurrenceRepository();
  const schedules = createTaskScheduleRepository(taskSchedules);

  return {
    async prepareReminderReconciliation(actor, taskIds) {
      await reminderReconciler.prepare(actor, normalizeReminderTaskIds(taskIds));
    },

    async loadApplyContextForUpdate(
      actor: AuthenticatedActor,
      rawTaskIds: readonly string[],
      rawBusyRequest,
      transaction: DatabaseTransaction,
    ) {
      const taskIds = parseOptionalTaskIds(rawTaskIds);
      const busyRequest = rawBusyRequest
        ? {
            timeZone: ianaTimeZoneSchema.parse(rawBusyRequest.timeZone),
            query: taskOccurrenceRangeQuerySchema.parse(rawBusyRequest.query),
            excludedTaskIds: parseOptionalTaskIds(rawBusyRequest.excludedTaskIds),
          }
        : null;
      const readOccurrencesInSnapshot = busyRequest
        ? createBoundedOccurrenceSnapshotReader({
            taskSchedules,
            expansion: recurrenceExpansion,
          })
        : null;
      const readOccurrences =
        readOccurrencesInSnapshot === null || busyRequest === null
          ? null
          : (readActor: AuthenticatedActor, query: ReviewedPlanBusyIntervalRequest["query"]) =>
              readOccurrencesInSnapshot(readActor, query, transaction, busyRequest.timeZone);
      const preview = busyRequest && readOccurrences ? await readOccurrences(actor, busyRequest.query) : null;
      const previewOwnerIds =
        preview && !preview.truncation.truncated ? preview.items.map(({ task }) => task.id) : [];
      const lockIds = [...new Set([...taskIds, ...previewOwnerIds])].sort();
      const locked = await lockTaskOwners(actor, lockIds, transaction, tasks);
      const storedSchedules = await repository.loadSchedulesForTasks(
        actor.userId,
        [...taskIds].sort(),
        transaction,
      );
      const byId = new Map(locked.map((task) => [task.id, task]));
      const schedulesByTask = new Map(storedSchedules.map((schedule) => [schedule.taskId, schedule]));
      const selectedTasks = taskIds.flatMap((id) => {
        const task = byId.get(id);
        if (!task || task.status !== "open" || task.deletedAt !== null) return [];
        const schedule = schedulesByTask.get(id);
        return [
          {
            id: task.id,
            title: task.title,
            descriptionMd: task.descriptionMd,
            priority: parsePriority(task.priority),
            version: task.version,
            schedule: schedule ? toScheduleValue(mapSchedule(schedule)) : null,
          },
        ];
      });
      return {
        tasks: selectedTasks,
        busyIntervals:
          busyRequest && readOccurrences && preview
            ? await readStableBusyIntervals({
                actor,
                request: busyRequest,
                preview,
                readOccurrences,
                lockedTaskIds: new Set(locked.map(({ id }) => id)),
              })
            : null,
      };
    },

    async applyBatch(
      actor: AuthenticatedActor,
      rawBatch: ReviewedPlanBatch,
      transaction: DatabaseTransaction,
    ): Promise<void> {
      const batch = reviewedPlanBatchSchema.parse(rawBatch);
      if (batch.creates.length === 0 && batch.updates.length === 0) return;
      await lockAndValidateTargets(actor, batch, transaction, tasks, recurrences);
      const now = clock.now();

      if (batch.creates.length > 0) {
        const inbox = await repository.loadInboxForUpdate(actor.userId, transaction);
        if (!inbox) throw taskResourceNotFound();
        const scope = { kind: "root" as const, listId: inbox.id, sectionId: null };
        await lockRankScope(transaction, taskRankLockScope(actor.userId, scope));
        const siblings = await tasks.listActiveRankScope(actor.userId, scope, transaction);
        const lastRank = siblings.at(-1)?.rank ?? null;
        const ranks = generateRanksBetween(lastRank, null, batch.creates.length);
        for (const [index, create] of batch.creates.entries()) {
          const task = await tasks.insert(
            {
              id: create.id,
              userId: actor.userId,
              listId: inbox.id,
              sectionId: null,
              parentTaskId: null,
              title: normalizeTaskTitle(create.title),
              descriptionMd: validateTaskDescription(create.descriptionMd),
              priority: create.priority,
              rank: requiredRank(ranks[index]),
              now,
            },
            transaction,
          );
          if (!task) throw taskConflict("A proposed task ID is already in use.");
          if (create.schedule) {
            await schedules.upsert(
              {
                userId: actor.userId,
                taskId: create.id,
                schedule: toScheduleWrite(create.schedule),
                now,
              },
              transaction,
            );
          }
        }
      }

      for (const update of batch.updates) {
        const patch = {
          ...(update.title === undefined ? {} : { title: normalizeTaskTitle(update.title) }),
          ...(update.descriptionMd === undefined
            ? {}
            : { descriptionMd: validateTaskDescription(update.descriptionMd) }),
          ...(update.priority === undefined ? {} : { priority: update.priority }),
        };
        const changesDetails = Object.keys(patch).length > 0;
        if (changesDetails) {
          requireAppliedTask(
            await tasks.updateDetails(
              {
                userId: actor.userId,
                id: update.id,
                expectedVersion: update.expectedVersion,
                patch,
                now,
              },
              transaction,
            ),
          );
        }
        if (update.schedule) {
          await schedules.upsert(
            {
              userId: actor.userId,
              taskId: update.id,
              schedule: toScheduleWrite(update.schedule),
              now,
            },
            transaction,
          );
          if (!changesDetails) {
            requireAppliedTask(
              await schedules.incrementTaskVersion(
                {
                  userId: actor.userId,
                  taskId: update.id,
                  expectedVersion: update.expectedVersion,
                  now,
                },
                transaction,
              ),
            );
          }
        }
      }

      const reminderRelevantTaskIds = batch.updates
        .filter(({ schedule }) => schedule !== undefined)
        .map(({ id }) => id)
        .sort();
      if (reminderRelevantTaskIds.length > 0) {
        await reminderReconciler.reconcile(
          actor,
          { taskIds: reminderRelevantTaskIds, reason: "schedule_changed" },
          transaction,
        );
      }
    },
  };
}

async function lockAndValidateTargets(
  actor: AuthenticatedActor,
  batch: ReviewedPlanBatch,
  transaction: DatabaseTransaction,
  tasks: ReturnType<typeof createTaskRepository>,
  recurrences: ReturnType<typeof createTaskRecurrenceRepository>,
) {
  const expectedVersions = new Map(batch.updates.map(({ id, expectedVersion }) => [id, expectedVersion]));
  const createIds = new Set(batch.creates.map(({ id }) => id));
  const allIds = [...createIds, ...expectedVersions.keys()].sort();
  for (const id of allIds) {
    const current = await tasks.lockById(actor.userId, id, "any", transaction);
    if (createIds.has(id)) {
      if (current) throw taskConflict("A proposed task ID is already in use.");
      continue;
    }
    const expectedVersion = expectedVersions.get(id);
    if (expectedVersion === undefined) throw new Error("Reviewed plan lost an expected version.");
    assertMutableTask(current, expectedVersion);
    if (current.status !== "open") {
      throw taskConflict("A proposed task is no longer open.", current.version);
    }
  }
  const scheduleTargetIds = batch.updates
    .filter(({ schedule }) => schedule !== undefined)
    .map(({ id }) => id)
    .sort();
  for (const id of scheduleTargetIds) {
    const recurrence = await recurrences.lockByTaskId(actor.userId, id, transaction);
    if (recurrence) {
      throw taskConflict(
        "Use the recurrence editor to change a recurring task's future schedule.",
        expectedVersions.get(id),
      );
    }
  }
}

async function lockTaskOwners(
  actor: AuthenticatedActor,
  taskIds: readonly string[],
  transaction: DatabaseTransaction,
  tasks: ReturnType<typeof createTaskRepository>,
): Promise<readonly StoredTask[]> {
  const locked: StoredTask[] = [];
  for (const taskId of taskIds) {
    const task = await tasks.lockById(actor.userId, taskId, "any", transaction);
    if (task) locked.push(task);
  }
  return locked;
}

async function readStableBusyIntervals(
  options: Readonly<{
    actor: AuthenticatedActor;
    request: ReviewedPlanBusyIntervalRequest;
    preview: BoundedTaskOccurrencePage;
    readOccurrences: (
      actor: AuthenticatedActor,
      query: ReviewedPlanBusyIntervalRequest["query"],
    ) => Promise<BoundedTaskOccurrencePage>;
    lockedTaskIds: ReadonlySet<string>;
  }>,
) {
  const page = options.preview.truncation.truncated
    ? options.preview
    : await options.readOccurrences(options.actor, options.request.query);
  if (!page.truncation.truncated && page.items.some(({ task }) => !options.lockedTaskIds.has(task.id))) {
    throw taskConflict("The calendar changed while the planner proposal was being validated.");
  }
  const excluded = new Set(options.request.excludedTaskIds);
  return {
    items: page.items.flatMap((item) => {
      if (excluded.has(item.task.id)) return [];
      const schedule =
        item.projectionKind === "one_off"
          ? item.schedule
          : item.occurrence.occurrenceState === "open" && item.occurrence.transitionEligible
            ? item.occurrence.schedule
            : null;
      return schedule?.kind === "timed" ? [{ startAt: schedule.startAt, endAt: schedule.endAt }] : [];
    }),
    truncation: page.truncation,
  };
}

function parseOptionalTaskIds(taskIds: readonly string[]): readonly string[] {
  if (taskIds.length === 0) return [];
  return taskSnapshotIdSelectionSchema.parse(taskIds);
}

function toScheduleValue(schedule: ReturnType<typeof mapSchedule>): TaskScheduleValue {
  return schedule.kind === "all_day"
    ? { kind: schedule.kind, startDate: schedule.startDate, endDate: schedule.endDate }
    : {
        kind: schedule.kind,
        startAt: schedule.startAt,
        endAt: schedule.endAt,
        timezone: schedule.timezone,
      };
}

function toScheduleWrite(schedule: TaskScheduleValue): ScheduleWriteValue {
  return schedule.kind === "all_day"
    ? schedule
    : {
        kind: schedule.kind,
        startAt: new Date(schedule.startAt),
        endAt: new Date(schedule.endAt),
        timezone: schedule.timezone,
      };
}

function parsePriority(value: string): ReviewedPlanTaskSnapshot["priority"] {
  if (value === "none" || value === "low" || value === "medium" || value === "high") return value;
  throw new Error("Task repository returned an invalid priority.");
}

function requiredRank(rank: string | undefined): string {
  if (!rank) throw new Error("Reviewed plan rank generation returned no rank.");
  return rank;
}
