import type { Database, DatabaseTransaction } from "@/shared/db/client";

import { advanceDormantRecurrenceCutover } from "./recurrence-lifecycle-coordinator";
import type { RecurrenceExpansionPort } from "./recurrence-expansion-port";
import { taskConflict } from "./task-errors";
import type { TaskScheduleTable } from "../infrastructure/schema";
import {
  createTaskRecurrenceRepository,
  type StoredTaskRecurrence,
} from "../infrastructure/task-recurrence-repository";
import {
  createTaskScheduleRepository,
  type StoredTaskSchedule,
} from "../infrastructure/task-schedule-repository";

type LockedRecurrenceResources = Readonly<{
  recurrence: StoredTaskRecurrence | null;
  schedule: StoredTaskSchedule | null;
}>;

export function createTaskRecurrenceLifecycle({
  database,
  expansion,
  taskSchedules,
}: Readonly<{
  database: Database;
  expansion: RecurrenceExpansionPort;
  taskSchedules: TaskScheduleTable;
}>) {
  const recurrences = createTaskRecurrenceRepository(database);
  const schedules = createTaskScheduleRepository(taskSchedules, database);

  return {
    async lockResources(
      userId: string,
      taskId: string,
      transaction: DatabaseTransaction,
    ): Promise<LockedRecurrenceResources> {
      const recurrence = await recurrences.lockByTaskId(userId, taskId, transaction);
      const schedule = await schedules.lockByTaskId(userId, taskId, transaction);
      if (recurrence && !schedule) {
        throw new Error("A stored task recurrence is missing its canonical schedule.");
      }
      return { recurrence, schedule };
    },

    assertCompletionAllowed(recurrence: StoredTaskRecurrence | null, currentVersion: number): void {
      if (recurrence && !hasEnded(recurrence)) {
        throw taskConflict(
          "Complete individual occurrences or end the recurring series first.",
          currentVersion,
        );
      }
    },

    assertSubtaskMoveAllowed(recurrence: StoredTaskRecurrence | null, currentVersion: number): void {
      if (recurrence) {
        throw taskConflict(
          "Clear this task's recurring schedule before moving it under another task.",
          currentVersion,
        );
      }
    },

    async advanceForResume(
      userId: string,
      resources: LockedRecurrenceResources,
      now: Date,
      transaction: DatabaseTransaction,
    ): Promise<void> {
      if (!resources.recurrence) return;
      if (!resources.schedule) {
        throw new Error("A stored task recurrence is missing its canonical schedule.");
      }
      await advanceDormantRecurrenceCutover({
        userId,
        recurrence: resources.recurrence,
        schedule: resources.schedule,
        now,
        executor: transaction,
        expansion,
        repository: recurrences,
      });
    },
  } as const;
}

export type TaskRecurrenceLifecycle = ReturnType<typeof createTaskRecurrenceLifecycle>;

function hasEnded(recurrence: StoredTaskRecurrence): boolean {
  return recurrence.projectionEndDate !== null || recurrence.projectionEndAt !== null;
}
