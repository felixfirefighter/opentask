import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import {
  clearTaskScheduleRequestSchema,
  entityIdSchema,
  setTaskScheduleRequestSchema,
  taskScheduleDtoSchema,
  taskScheduleMutationResultSchema,
  taskScheduleRangePageSchema,
  taskScheduleRangeQuerySchema,
  versionedResourceReferenceSchema,
  type ClearTaskScheduleRequest,
  type SetTaskScheduleRequest,
  type TaskScheduleDto,
  type TaskScheduleMutationResult,
  type TaskScheduleRangePage,
  type TaskScheduleRangeQuery,
  type TaskScheduleValue,
} from "./contracts";
import { assertMutableTask, mapTask, requireAppliedTask } from "./task-application-support";
import { taskConflict, taskResourceNotFound } from "./task-errors";
import {
  createTaskScheduleRepository,
  type ScheduleWriteValue,
  type StoredTaskSchedule,
} from "../infrastructure/task-schedule-repository";
import { createTaskRecurrenceRepository } from "../infrastructure/task-recurrence-repository";
import { createTaskRepository } from "../infrastructure/task-repository";
import type { TaskScheduleTable } from "../infrastructure/schema";

export function createTaskScheduleApplication({
  database,
  clock,
  taskSchedules,
}: {
  database: Database;
  clock: Clock;
  taskSchedules: TaskScheduleTable;
}) {
  const tasks = createTaskRepository(database);
  const schedules = createTaskScheduleRepository(taskSchedules, database);
  const recurrences = createTaskRecurrenceRepository(database);

  return {
    async getSchedule(actor: AuthenticatedActor, rawTaskId: string): Promise<TaskScheduleDto | null> {
      const taskId = entityIdSchema.parse(rawTaskId);
      const task = await tasks.findById(actor.userId, taskId, "active");
      if (!task) throw taskResourceNotFound();
      const schedule = await schedules.findByTaskId(actor.userId, taskId);
      return schedule ? mapSchedule(schedule) : null;
    },

    async setSchedule(
      actor: AuthenticatedActor,
      rawTaskId: string,
      rawInput: SetTaskScheduleRequest,
    ): Promise<TaskScheduleMutationResult> {
      const taskId = entityIdSchema.parse(rawTaskId);
      const input = setTaskScheduleRequestSchema.parse(rawInput);
      return database.transaction(async (transaction) => {
        const current = await tasks.lockById(actor.userId, taskId, "any", transaction);
        assertMutableTask(current, input.expectedVersion);
        const recurrence = await recurrences.lockByTaskId(actor.userId, taskId, transaction);
        await schedules.lockByTaskId(actor.userId, taskId, transaction);
        if (recurrence) {
          throw taskConflict(
            "Use the recurrence editor to change a recurring task's future schedule.",
            current.version,
          );
        }
        const now = clock.now();
        const schedule = await schedules.upsert(
          {
            userId: actor.userId,
            taskId,
            schedule: toScheduleWrite(input.schedule),
            now,
          },
          transaction,
        );
        const updated = requireAppliedTask(
          await schedules.incrementTaskVersion(
            { userId: actor.userId, taskId, expectedVersion: input.expectedVersion, now },
            transaction,
          ),
        );
        return taskScheduleMutationResultSchema.parse({
          task: versionedResourceReferenceSchema.parse({ id: updated.id, version: updated.version }),
          schedule: mapSchedule(schedule),
        });
      });
    },

    async clearSchedule(
      actor: AuthenticatedActor,
      rawTaskId: string,
      rawInput: ClearTaskScheduleRequest,
    ): Promise<TaskScheduleMutationResult> {
      const taskId = entityIdSchema.parse(rawTaskId);
      const input = clearTaskScheduleRequestSchema.parse(rawInput);
      return database.transaction(async (transaction) => {
        const current = await tasks.lockById(actor.userId, taskId, "any", transaction);
        assertMutableTask(current, input.expectedVersion);
        const recurrence = await recurrences.lockByTaskId(actor.userId, taskId, transaction);
        await schedules.lockByTaskId(actor.userId, taskId, transaction);
        if (recurrence && !hasEndedRecurrence(recurrence)) {
          throw taskConflict("End recurrence before clearing this schedule.", current.version);
        }
        if (recurrence) await recurrences.remove(actor.userId, taskId, transaction);
        const removed = await schedules.clear(actor.userId, taskId, transaction);
        if (!removed) throw taskConflict("This task is already unscheduled.", current.version);
        const updated = requireAppliedTask(
          await schedules.incrementTaskVersion(
            {
              userId: actor.userId,
              taskId,
              expectedVersion: input.expectedVersion,
              now: clock.now(),
            },
            transaction,
          ),
        );
        return taskScheduleMutationResultSchema.parse({
          task: versionedResourceReferenceSchema.parse({ id: updated.id, version: updated.version }),
          schedule: null,
        });
      });
    },

    async listRange(
      actor: AuthenticatedActor,
      rawQuery: TaskScheduleRangeQuery,
    ): Promise<TaskScheduleRangePage> {
      const query = taskScheduleRangeQuerySchema.parse(rawQuery);
      const page = await schedules.listActiveOpenInRange(actor.userId, {
        rangeStartDate: query.rangeStartDate,
        rangeEndDate: query.rangeEndDate,
        rangeStartAt: new Date(query.rangeStartAt),
        rangeEndAt: new Date(query.rangeEndAt),
        limit: query.limit,
      });
      return taskScheduleRangePageSchema.parse({
        items: page.items.map(({ task, schedule }) => ({
          task: mapTask(task),
          schedule: mapSchedule(schedule),
        })),
        truncated: page.truncated,
      });
    },
  } as const;
}

function hasEndedRecurrence(
  recurrence: Readonly<{ projectionEndDate: string | null; projectionEndAt: Date | null }>,
): boolean {
  return recurrence.projectionEndDate !== null || recurrence.projectionEndAt !== null;
}

export function toScheduleWrite(schedule: TaskScheduleValue): ScheduleWriteValue {
  return schedule.kind === "all_day"
    ? schedule
    : {
        kind: schedule.kind,
        startAt: new Date(schedule.startAt),
        endAt: new Date(schedule.endAt),
        timezone: schedule.timezone,
      };
}

export function mapSchedule(schedule: StoredTaskSchedule): TaskScheduleDto {
  const common = {
    taskId: schedule.taskId,
    createdAt: schedule.createdAt.toISOString(),
    updatedAt: schedule.updatedAt.toISOString(),
  };
  if (schedule.kind === "all_day") {
    return taskScheduleDtoSchema.parse({
      ...common,
      kind: schedule.kind,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
    });
  }
  if (schedule.kind === "timed") {
    return taskScheduleDtoSchema.parse({
      ...common,
      kind: schedule.kind,
      startAt: schedule.startAt?.toISOString(),
      endAt: schedule.endAt?.toISOString(),
      timezone: schedule.timezone,
    });
  }
  throw new Error("Schedule repository returned an unknown schedule kind.");
}
