import { and, asc, eq, gt, gte, isNull, lt, or } from "drizzle-orm";

import { getDatabase, type DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

import type { TaskScheduleTable } from "./schema";

export type StoredTaskPlanningRow = Readonly<{
  task: typeof schema.tasks.$inferSelect;
  schedule: TaskScheduleTable["$inferSelect"] | null;
}>;

export type StoredTaskPlanningPage = Readonly<{
  items: readonly StoredTaskPlanningRow[];
  truncated: boolean;
}>;

type ScheduledRange = Readonly<{
  rangeStartDate: string;
  rangeEndDate: string;
  rangeStartAt: Date;
  rangeEndAt: Date;
  limit: number;
}>;

export function createTaskPlanningSourceRepository(
  taskSchedules: TaskScheduleTable,
  defaultExecutor: DatabaseExecutor = getDatabase(),
) {
  const activeOmplish = (userId: string) =>
    and(eq(schema.tasks.userId, userId), eq(schema.tasks.status, "open"), isNull(schema.tasks.deletedAt));

  const toPage = (rows: readonly StoredTaskPlanningRow[], limit: number): StoredTaskPlanningPage => ({
    items: rows.slice(0, limit),
    truncated: rows.length > limit,
  });

  return {
    async listScheduledThrough(
      userId: string,
      input: Readonly<{ exclusiveEndDate: string; exclusiveEndAt: Date; limit: number }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskPlanningPage> {
      assertLimit(input.limit);
      const rows = await executor
        .select({ task: schema.tasks, schedule: taskSchedules })
        .from(taskSchedules)
        .innerJoin(
          schema.tasks,
          and(eq(schema.tasks.userId, taskSchedules.userId), eq(schema.tasks.id, taskSchedules.taskId)),
        )
        .where(
          and(
            eq(taskSchedules.userId, userId),
            activeOmplish(userId),
            or(
              and(eq(taskSchedules.kind, "all_day"), lt(taskSchedules.startDate, input.exclusiveEndDate)),
              and(eq(taskSchedules.kind, "timed"), lt(taskSchedules.startAt, input.exclusiveEndAt)),
            ),
          ),
        )
        .orderBy(asc(schema.tasks.id))
        .limit(input.limit + 1);
      return toPage(rows, input.limit);
    },

    async listScheduledRange(
      userId: string,
      input: ScheduledRange,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskPlanningPage> {
      assertLimit(input.limit);
      const rows = await executor
        .select({ task: schema.tasks, schedule: taskSchedules })
        .from(taskSchedules)
        .innerJoin(
          schema.tasks,
          and(eq(schema.tasks.userId, taskSchedules.userId), eq(schema.tasks.id, taskSchedules.taskId)),
        )
        .where(
          and(
            eq(taskSchedules.userId, userId),
            activeOmplish(userId),
            or(
              and(
                eq(taskSchedules.kind, "all_day"),
                lt(taskSchedules.startDate, input.rangeEndDate),
                gt(taskSchedules.endDate, input.rangeStartDate),
              ),
              and(
                eq(taskSchedules.kind, "timed"),
                lt(taskSchedules.startAt, input.rangeEndAt),
                or(
                  gt(taskSchedules.endAt, input.rangeStartAt),
                  and(
                    eq(taskSchedules.startAt, taskSchedules.endAt),
                    gte(taskSchedules.startAt, input.rangeStartAt),
                  ),
                ),
              ),
            ),
          ),
        )
        .orderBy(asc(schema.tasks.id))
        .limit(input.limit + 1);
      return toPage(rows, input.limit);
    },

    async listAllOpen(
      userId: string,
      limit: number,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskPlanningPage> {
      assertLimit(limit);
      const rows = await executor
        .select({ task: schema.tasks, schedule: taskSchedules })
        .from(schema.tasks)
        .leftJoin(
          taskSchedules,
          and(
            eq(taskSchedules.userId, userId),
            eq(taskSchedules.userId, schema.tasks.userId),
            eq(taskSchedules.taskId, schema.tasks.id),
          ),
        )
        .where(activeOmplish(userId))
        .orderBy(asc(schema.tasks.id))
        .limit(limit + 1);
      return toPage(rows, limit);
    },
  } as const;
}

function assertLimit(limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new RangeError("Planning source limit must be between 1 and 500.");
  }
}
