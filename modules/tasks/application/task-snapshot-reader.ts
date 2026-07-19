import type { Database } from "@/shared/db/client";

import {
  taskSnapshotDtoSchema,
  taskSnapshotIdSelectionSchema,
  type TaskSnapshotDto,
  type TaskSnapshotReader,
} from "./contracts";
import { taskResourceNotFound } from "./task-errors";
import { createTaskScheduleRepository } from "../infrastructure/task-schedule-repository";
import type { TaskScheduleTable } from "../infrastructure/schema";

export function createTaskSnapshotReader({
  database,
  taskSchedules,
}: {
  database: Database;
  taskSchedules: TaskScheduleTable;
}): TaskSnapshotReader {
  const schedules = createTaskScheduleRepository(taskSchedules, database);
  return {
    async loadOpenUnscheduled(actor, rawTaskIds): Promise<readonly TaskSnapshotDto[]> {
      const taskIds = taskSnapshotIdSelectionSchema.parse(rawTaskIds);
      const rows = await schedules.loadOpenUnscheduled(actor.userId, taskIds);
      if (rows.length !== taskIds.length) throw taskResourceNotFound();
      const byId = new Map(rows.map((row) => [row.id, row]));
      return taskIds.map((id) => {
        const row = byId.get(id);
        if (!row) throw taskResourceNotFound();
        return taskSnapshotDtoSchema.parse({
          id: row.id,
          title: row.title,
          descriptionMd: row.descriptionMd,
          priority: row.priority,
          version: row.version,
        });
      });
    },
  };
}
