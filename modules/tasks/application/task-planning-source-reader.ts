import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { DatabaseTransaction } from "@/shared/db/client";

import {
  taskPlanningSourcePageSchema,
  taskPlanningSourceQuerySchema,
  type TaskPlanningSourcePage,
  type TaskPlanningSourceQuery,
  type TaskPlanningSourceReader,
} from "./contracts";
import { mapTask } from "./task-application-support";
import { mapSchedule } from "./schedule-application";
import type { TaskReadSnapshot } from "./task-read-snapshot";
import { createTaskPlanningSourceRepository } from "../infrastructure/task-planning-source-repository";
import type { TaskScheduleTable } from "../infrastructure/schema";

export function createTaskPlanningSourceReader({
  readInSnapshot,
  snapshot,
}: {
  readInSnapshot: ReturnType<typeof createTaskPlanningSourceSnapshotReader>;
  snapshot: TaskReadSnapshot;
}): TaskPlanningSourceReader {
  return {
    async readOpenTasks(actor, rawQuery) {
      const query = taskPlanningSourceQuerySchema.parse(rawQuery);
      return snapshot.run((transaction) => readInSnapshot(actor, query, transaction));
    },
  };
}

export function createTaskPlanningSourceSnapshotReader({
  taskSchedules,
}: {
  taskSchedules: TaskScheduleTable;
}) {
  return async function readOpenTasksInSnapshot(
    actor: AuthenticatedActor,
    rawQuery: TaskPlanningSourceQuery,
    transaction: DatabaseTransaction,
  ): Promise<TaskPlanningSourcePage> {
    const query = taskPlanningSourceQuerySchema.parse(rawQuery);
    const repository = createTaskPlanningSourceRepository(taskSchedules, transaction);
    const page =
      query.kind === "scheduled_through"
        ? await repository.listScheduledThrough(
            actor.userId,
            {
              exclusiveEndDate: query.exclusiveEndDate,
              exclusiveEndAt: new Date(query.exclusiveEndAt),
              limit: query.limit,
            },
            transaction,
          )
        : query.kind === "scheduled_range"
          ? await repository.listScheduledRange(
              actor.userId,
              {
                rangeStartDate: query.rangeStartDate,
                rangeEndDate: query.rangeEndDate,
                rangeStartAt: new Date(query.rangeStartAt),
                rangeEndAt: new Date(query.rangeEndAt),
                limit: query.limit,
              },
              transaction,
            )
          : await repository.listAllOpen(actor.userId, query.limit, transaction);

    return taskPlanningSourcePageSchema.parse({
      items: page.items.map(({ task, schedule, recurrenceRoot }) => ({
        task: mapTask(task),
        schedule: schedule ? mapSchedule(schedule) : null,
        recurrenceRoot,
      })),
      truncated: page.truncated,
    });
  };
}
