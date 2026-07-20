import { and, asc, eq, gt, gte, inArray, isNull, lt, notExists, or, sql } from "drizzle-orm";

import { getDatabase, type DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

import type { TaskWriteResult } from "./task-repository";
import type { TaskScheduleTable } from "./schema";

export type StoredTaskSchedule = TaskScheduleTable["$inferSelect"];
export type StoredScheduledTask = Readonly<{
  task: typeof schema.tasks.$inferSelect;
  schedule: StoredTaskSchedule;
}>;
export type StoredScheduleRangePage = Readonly<{
  items: readonly StoredScheduledTask[];
  truncated: boolean;
}>;
export type ScheduleWriteValue =
  | Readonly<{ kind: "all_day"; startDate: string; endDate: string }>
  | Readonly<{ kind: "timed"; startAt: Date; endAt: Date; timezone: string }>;
export type StoredTaskSnapshot = Pick<
  typeof schema.tasks.$inferSelect,
  "id" | "title" | "descriptionMd" | "priority" | "version"
>;

type ScheduleRange = Readonly<{
  rangeStartDate: string;
  rangeEndDate: string;
  rangeStartAt: Date;
  rangeEndAt: Date;
  limit: number;
}>;

export function createTaskScheduleRepository(
  taskSchedules: TaskScheduleTable,
  defaultExecutor: DatabaseExecutor = getDatabase(),
) {
  return {
    async findByTaskId(
      userId: string,
      taskId: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskSchedule | null> {
      const [row] = await executor
        .select()
        .from(taskSchedules)
        .where(and(eq(taskSchedules.userId, userId), eq(taskSchedules.taskId, taskId)))
        .limit(1);
      return row ?? null;
    },

    async lockByTaskId(
      userId: string,
      taskId: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskSchedule | null> {
      const [row] = await executor
        .select()
        .from(taskSchedules)
        .where(and(eq(taskSchedules.userId, userId), eq(taskSchedules.taskId, taskId)))
        .limit(1)
        .for("update");
      return row ?? null;
    },

    async upsert(
      input: Readonly<{
        userId: string;
        taskId: string;
        schedule: ScheduleWriteValue;
        now: Date;
      }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskSchedule> {
      const values = scheduleValues(input.schedule);
      const [row] = await executor
        .insert(taskSchedules)
        .values({
          userId: input.userId,
          taskId: input.taskId,
          ...values,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .onConflictDoUpdate({
          target: [taskSchedules.userId, taskSchedules.taskId],
          set: { ...values, updatedAt: input.now },
        })
        .returning();
      if (!row) throw new Error("Schedule upsert did not return the stored row.");
      return row;
    },

    async clear(
      userId: string,
      taskId: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskSchedule | null> {
      const [row] = await executor
        .delete(taskSchedules)
        .where(and(eq(taskSchedules.userId, userId), eq(taskSchedules.taskId, taskId)))
        .returning();
      return row ?? null;
    },

    async incrementTaskVersion(
      input: Readonly<{ userId: string; taskId: string; expectedVersion: number; now: Date }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<TaskWriteResult> {
      const [task] = await executor
        .update(schema.tasks)
        .set({ updatedAt: input.now, version: sql`${schema.tasks.version} + 1` })
        .where(
          and(
            eq(schema.tasks.userId, input.userId),
            eq(schema.tasks.id, input.taskId),
            eq(schema.tasks.version, input.expectedVersion),
            isNull(schema.tasks.deletedAt),
          ),
        )
        .returning();
      if (task) return { outcome: "applied", task };

      const [current] = await executor
        .select({ version: schema.tasks.version, deletedAt: schema.tasks.deletedAt })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.userId, input.userId), eq(schema.tasks.id, input.taskId)))
        .limit(1);
      if (!current) return { outcome: "not-found" };
      if (current.version !== input.expectedVersion) {
        return { outcome: "stale", currentVersion: current.version };
      }
      return {
        outcome: "lifecycle-conflict",
        currentVersion: current.version,
        lifecycle: current.deletedAt === null ? "active" : "deleted",
      };
    },

    async listActiveOpenInRange(
      userId: string,
      range: ScheduleRange,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredScheduleRangePage> {
      assertRangeLimit(range.limit);
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
            eq(schema.tasks.userId, userId),
            eq(schema.tasks.status, "open"),
            isNull(schema.tasks.deletedAt),
            or(allDayOverlap(taskSchedules, range), timedOverlap(taskSchedules, range)),
          ),
        )
        .orderBy(asc(taskSchedules.taskId))
        .limit(range.limit + 1);
      return {
        items: rows.slice(0, range.limit),
        truncated: rows.length > range.limit,
      };
    },

    async loadOpenUnscheduled(
      userId: string,
      taskIds: readonly string[],
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<readonly StoredTaskSnapshot[]> {
      if (taskIds.length < 1 || taskIds.length > 100 || new Set(taskIds).size !== taskIds.length) {
        throw new RangeError("Task snapshot selection must contain 1 to 100 unique IDs.");
      }
      return executor
        .select({
          id: schema.tasks.id,
          title: schema.tasks.title,
          descriptionMd: schema.tasks.descriptionMd,
          priority: schema.tasks.priority,
          version: schema.tasks.version,
        })
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.userId, userId),
            inArray(schema.tasks.id, taskIds),
            eq(schema.tasks.status, "open"),
            isNull(schema.tasks.deletedAt),
            notExists(
              executor
                .select({ one: sql<number>`1` })
                .from(taskSchedules)
                .where(
                  and(
                    eq(taskSchedules.userId, userId),
                    eq(taskSchedules.userId, schema.tasks.userId),
                    eq(taskSchedules.taskId, schema.tasks.id),
                  ),
                ),
            ),
          ),
        );
    },
  };
}

function scheduleValues(schedule: ScheduleWriteValue) {
  return schedule.kind === "all_day"
    ? {
        kind: schedule.kind,
        startDate: schedule.startDate,
        endDate: schedule.endDate,
        startAt: null,
        endAt: null,
        timezone: null,
      }
    : {
        kind: schedule.kind,
        startDate: null,
        endDate: null,
        startAt: schedule.startAt,
        endAt: schedule.endAt,
        timezone: schedule.timezone,
      };
}

function allDayOverlap(taskSchedules: TaskScheduleTable, range: ScheduleRange) {
  return and(
    eq(taskSchedules.kind, "all_day"),
    lt(taskSchedules.startDate, range.rangeEndDate),
    gt(taskSchedules.endDate, range.rangeStartDate),
  );
}

function timedOverlap(taskSchedules: TaskScheduleTable, range: ScheduleRange) {
  return and(
    eq(taskSchedules.kind, "timed"),
    lt(taskSchedules.startAt, range.rangeEndAt),
    or(
      gt(taskSchedules.endAt, range.rangeStartAt),
      and(eq(taskSchedules.startAt, taskSchedules.endAt), gte(taskSchedules.startAt, range.rangeStartAt)),
    ),
  );
}

function assertRangeLimit(limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new RangeError("Schedule range limit must be between 1 and 500.");
  }
}
