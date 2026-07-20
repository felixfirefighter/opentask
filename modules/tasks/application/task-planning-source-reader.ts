import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database } from "@/shared/db/client";

import {
  taskPlanningSourcePageSchema,
  taskPlanningSourceQuerySchema,
  type TaskPlanningSourcePage,
  type TaskPlanningSourceQuery,
  type TaskPlanningSourceReader,
} from "./contracts";
import { mapTask } from "./task-application-support";
import { mapSchedule } from "./schedule-application";
import { createTaskPlanningSourceRepository } from "../infrastructure/task-planning-source-repository";
import type { TaskScheduleTable } from "../infrastructure/schema";

export function createTaskPlanningSourceReader({
  database,
  taskSchedules,
}: {
  database: Database;
  taskSchedules: TaskScheduleTable;
}): TaskPlanningSourceReader {
  const repository = createTaskPlanningSourceRepository(taskSchedules, database);

  return {
    async readOpenTasks(
      actor: AuthenticatedActor,
      rawQuery: TaskPlanningSourceQuery,
    ): Promise<TaskPlanningSourcePage> {
      const query = taskPlanningSourceQuerySchema.parse(rawQuery);
      const page =
        query.kind === "scheduled_through"
          ? await repository.listScheduledThrough(actor.userId, {
              exclusiveEndDate: query.exclusiveEndDate,
              exclusiveEndAt: new Date(query.exclusiveEndAt),
              limit: query.limit,
            })
          : query.kind === "scheduled_range"
            ? await repository.listScheduledRange(actor.userId, {
                rangeStartDate: query.rangeStartDate,
                rangeEndDate: query.rangeEndDate,
                rangeStartAt: new Date(query.rangeStartAt),
                rangeEndAt: new Date(query.rangeEndAt),
                limit: query.limit,
              })
            : await repository.listAllOpen(actor.userId, query.limit);

      return taskPlanningSourcePageSchema.parse({
        items: page.items.map(({ task, schedule, recurrenceRoot }) => ({
          task: mapTask(task),
          schedule: schedule ? mapSchedule(schedule) : null,
          recurrenceRoot,
        })),
        truncated: page.truncated,
      });
    },
  };
}
