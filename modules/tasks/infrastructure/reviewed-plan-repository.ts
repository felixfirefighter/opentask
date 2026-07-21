import { and, asc, eq, gt, gte, inArray, isNull, lt, notInArray, or } from "drizzle-orm";

import type { DatabaseTransaction } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

import type { TaskScheduleTable } from "./schema";

export function createReviewedPlanRepository(taskSchedules: TaskScheduleTable) {
  return {
    loadOmplishsForUpdate(userId: string, taskIds: readonly string[], transaction: DatabaseTransaction) {
      if (taskIds.length === 0) return Promise.resolve([]);
      return transaction
        .select()
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.userId, userId),
            inArray(schema.tasks.id, taskIds),
            eq(schema.tasks.status, "open"),
            isNull(schema.tasks.deletedAt),
          ),
        )
        .orderBy(asc(schema.tasks.id))
        .for("update");
    },

    loadSchedulesForTasks(userId: string, taskIds: readonly string[], transaction: DatabaseTransaction) {
      if (taskIds.length === 0) return Promise.resolve([]);
      return transaction
        .select()
        .from(taskSchedules)
        .where(and(eq(taskSchedules.userId, userId), inArray(taskSchedules.taskId, taskIds)))
        .orderBy(asc(taskSchedules.taskId))
        .for("update");
    },

    async listBusyForUpdate(
      userId: string,
      range: Readonly<{
        rangeStartDate: string;
        rangeEndDate: string;
        rangeStartAt: Date;
        rangeEndAt: Date;
        limit: number;
      }>,
      excludedTaskIds: readonly string[],
      transaction: DatabaseTransaction,
    ) {
      const rows = await transaction
        .select({ schedule: taskSchedules })
        .from(taskSchedules)
        .innerJoin(
          schema.tasks,
          and(eq(schema.tasks.userId, taskSchedules.userId), eq(schema.tasks.id, taskSchedules.taskId)),
        )
        .where(
          and(
            eq(taskSchedules.userId, userId),
            eq(schema.tasks.userId, userId),
            eq(schema.tasks.status, "open"),
            isNull(schema.tasks.deletedAt),
            excludedTaskIds.length > 0 ? notInArray(taskSchedules.taskId, [...excludedTaskIds]) : undefined,
            or(
              and(
                eq(taskSchedules.kind, "all_day"),
                lt(taskSchedules.startDate, range.rangeEndDate),
                gt(taskSchedules.endDate, range.rangeStartDate),
              ),
              and(
                eq(taskSchedules.kind, "timed"),
                lt(taskSchedules.startAt, range.rangeEndAt),
                or(
                  gt(taskSchedules.endAt, range.rangeStartAt),
                  and(
                    eq(taskSchedules.startAt, taskSchedules.endAt),
                    gte(taskSchedules.startAt, range.rangeStartAt),
                  ),
                ),
              ),
            ),
          ),
        )
        .orderBy(asc(taskSchedules.taskId))
        .limit(range.limit + 1)
        .for("update");
      return { items: rows.slice(0, range.limit), truncated: rows.length > range.limit };
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
