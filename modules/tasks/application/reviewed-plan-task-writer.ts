import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { DatabaseTransaction } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import {
  reviewedPlanBatchSchema,
  taskScheduleRangeQuerySchema,
  taskSnapshotIdSelectionSchema,
  type ReviewedPlanBatch,
  type ReviewedPlanTaskSnapshot,
  type ReviewedPlanTaskWriter,
  type TaskScheduleValue,
} from "./contracts";
import { generateRanksBetween } from "./ranking";
import { mapSchedule } from "./schedule-application";
import { assertMutableTask, requireAppliedTask, taskRankLockScope } from "./task-application-support";
import { taskConflict, taskResourceNotFound } from "./task-errors";
import { normalizeTaskTitle, validateTaskDescription } from "../domain/task-text";
import { createReviewedPlanRepository } from "../infrastructure/reviewed-plan-repository";
import type { TaskScheduleTable } from "../infrastructure/schema";
import { lockRankScope } from "../infrastructure/rank-scope-lock";
import { createTaskRepository } from "../infrastructure/task-repository";
import {
  createTaskScheduleRepository,
  type ScheduleWriteValue,
} from "../infrastructure/task-schedule-repository";

export function createReviewedPlanTaskWriter({
  clock,
  taskSchedules,
}: {
  clock: Clock;
  taskSchedules: TaskScheduleTable;
}): ReviewedPlanTaskWriter {
  const repository = createReviewedPlanRepository(taskSchedules);
  const tasks = createTaskRepository();
  const schedules = createTaskScheduleRepository(taskSchedules);

  return {
    async loadOwnedOpenForUpdate(
      actor: AuthenticatedActor,
      rawTaskIds: readonly string[],
      transaction: DatabaseTransaction,
    ): Promise<readonly ReviewedPlanTaskSnapshot[]> {
      if (rawTaskIds.length === 0) return [];
      const taskIds = taskSnapshotIdSelectionSchema.parse(rawTaskIds);
      const locked = await repository.loadOmplishsForUpdate(actor.userId, [...taskIds].sort(), transaction);
      const storedSchedules = await repository.loadSchedulesForTasks(
        actor.userId,
        [...taskIds].sort(),
        transaction,
      );
      const byId = new Map(locked.map((task) => [task.id, task]));
      const schedulesByTask = new Map(storedSchedules.map((schedule) => [schedule.taskId, schedule]));
      return taskIds.flatMap((id) => {
        const task = byId.get(id);
        if (!task) return [];
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
    },

    async loadBusySchedulesForUpdate(actor, rawQuery, rawExcludedTaskIds, transaction) {
      const query = taskScheduleRangeQuerySchema.parse(rawQuery);
      const excludedTaskIds = parseOptionalTaskIds(rawExcludedTaskIds);
      const page = await repository.listBusyForUpdate(
        actor.userId,
        {
          rangeStartDate: query.rangeStartDate,
          rangeEndDate: query.rangeEndDate,
          rangeStartAt: new Date(query.rangeStartAt),
          rangeEndAt: new Date(query.rangeEndAt),
          limit: query.limit,
        },
        excludedTaskIds,
        transaction,
      );
      return {
        items: page.items.map(({ schedule }) => ({
          schedule: toScheduleValue(mapSchedule(schedule)),
        })),
        truncated: page.truncated,
      };
    },

    async applyBatch(
      actor: AuthenticatedActor,
      rawBatch: ReviewedPlanBatch,
      transaction: DatabaseTransaction,
    ): Promise<void> {
      const batch = reviewedPlanBatchSchema.parse(rawBatch);
      if (batch.creates.length === 0 && batch.updates.length === 0) return;
      await lockAndValidateTargets(actor, batch, transaction, tasks);
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
    },
  };
}

async function lockAndValidateTargets(
  actor: AuthenticatedActor,
  batch: ReviewedPlanBatch,
  transaction: DatabaseTransaction,
  tasks: ReturnType<typeof createTaskRepository>,
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
