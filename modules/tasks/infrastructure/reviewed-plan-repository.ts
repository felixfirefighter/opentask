import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type { DatabaseTransaction } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

import type { TaskScheduleTable } from "./schema";

export function createReviewedPlanRepository(taskSchedules: TaskScheduleTable) {
  return {
    loadSchedulesForTasks(userId: string, taskIds: readonly string[], transaction: DatabaseTransaction) {
      if (taskIds.length === 0) return Promise.resolve([]);
      return transaction
        .select()
        .from(taskSchedules)
        .where(and(eq(taskSchedules.userId, userId), inArray(taskSchedules.taskId, taskIds)))
        .orderBy(asc(taskSchedules.taskId))
        .for("update");
    },

    async loadInboxForUpdate(userId: string, transaction: DatabaseTransaction) {
      const [row] = await transaction
        .select()
        .from(schema.taskLists)
        .where(
          and(
            eq(schema.taskLists.userId, userId),
            eq(schema.taskLists.kind, "inbox"),
            isNull(schema.taskLists.deletedAt),
          ),
        )
        .limit(1)
        .for("update");
      return row ?? null;
    },
  } as const;
}
