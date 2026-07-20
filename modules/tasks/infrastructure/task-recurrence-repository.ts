import { and, asc, eq, gt, isNull, lt, or } from "drizzle-orm";

import { getDatabase, type DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

import type { StoredTaskSchedule } from "./task-schedule-repository";

export type StoredTaskRecurrence = typeof schema.taskRecurrences.$inferSelect;
export type StoredTaskRecurrenceSource = Readonly<{
  task: typeof schema.tasks.$inferSelect;
  schedule: StoredTaskSchedule;
  recurrence: StoredTaskRecurrence;
}>;
export type StoredRecurrenceSourcePage = Readonly<{
  items: readonly StoredTaskRecurrenceSource[];
  truncated: boolean;
}>;

export type RecurrenceCutoverWrite =
  | Readonly<{
      kind: "all_day";
      projectionStartDate: string;
      projectionEndDate: string | null;
    }>
  | Readonly<{
      kind: "timed";
      projectionStartAt: Date;
      projectionEndAt: Date | null;
    }>;

export type RecurrenceWrite = Readonly<{
  rrule: string;
  timezone: string;
  cutover: RecurrenceCutoverWrite;
}>;

type RecurrenceRange = Readonly<{
  rangeStartDate: string;
  rangeEndDate: string;
  rangeStartAt: Date;
  rangeEndAt: Date;
  limit: number;
}>;

export function createTaskRecurrenceRepository(defaultExecutor: DatabaseExecutor = getDatabase()) {
  return {
    async findByTaskId(
      userId: string,
      taskId: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskRecurrence | null> {
      const [row] = await executor
        .select()
        .from(schema.taskRecurrences)
        .where(and(eq(schema.taskRecurrences.userId, userId), eq(schema.taskRecurrences.taskId, taskId)))
        .limit(1);
      return row ?? null;
    },

    async lockByTaskId(
      userId: string,
      taskId: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskRecurrence | null> {
      const [row] = await executor
        .select()
        .from(schema.taskRecurrences)
        .where(and(eq(schema.taskRecurrences.userId, userId), eq(schema.taskRecurrences.taskId, taskId)))
        .limit(1)
        .for("update");
      return row ?? null;
    },

    async insert(
      input: Readonly<{
        userId: string;
        taskId: string;
        recurrence: RecurrenceWrite;
        now: Date;
      }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskRecurrence | null> {
      const [row] = await executor
        .insert(schema.taskRecurrences)
        .values({
          userId: input.userId,
          taskId: input.taskId,
          rrule: input.recurrence.rrule,
          timezone: input.recurrence.timezone,
          generationMode: "schedule",
          ...cutoverValues(input.recurrence.cutover),
          createdAt: input.now,
          updatedAt: input.now,
        })
        .onConflictDoNothing({ target: [schema.taskRecurrences.userId, schema.taskRecurrences.taskId] })
        .returning();
      return row ?? null;
    },

    async replace(
      input: Readonly<{
        userId: string;
        taskId: string;
        recurrence: RecurrenceWrite;
        now: Date;
      }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskRecurrence | null> {
      const [row] = await executor
        .update(schema.taskRecurrences)
        .set({
          rrule: input.recurrence.rrule,
          timezone: input.recurrence.timezone,
          generationMode: "schedule",
          ...cutoverValues(input.recurrence.cutover),
          updatedAt: input.now,
        })
        .where(
          and(
            eq(schema.taskRecurrences.userId, input.userId),
            eq(schema.taskRecurrences.taskId, input.taskId),
          ),
        )
        .returning();
      return row ?? null;
    },

    async remove(
      userId: string,
      taskId: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskRecurrence | null> {
      const [row] = await executor
        .delete(schema.taskRecurrences)
        .where(and(eq(schema.taskRecurrences.userId, userId), eq(schema.taskRecurrences.taskId, taskId)))
        .returning();
      return row ?? null;
    },

    async listActiveOpenSourcesInRange(
      userId: string,
      range: RecurrenceRange,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredRecurrenceSourcePage> {
      assertSourceLimit(range.limit);
      const rows = await executor
        .select({
          task: schema.tasks,
          schedule: schema.taskSchedules,
          recurrence: schema.taskRecurrences,
        })
        .from(schema.taskRecurrences)
        .innerJoin(
          schema.tasks,
          and(
            eq(schema.tasks.userId, schema.taskRecurrences.userId),
            eq(schema.tasks.id, schema.taskRecurrences.taskId),
          ),
        )
        .innerJoin(
          schema.taskSchedules,
          and(
            eq(schema.taskSchedules.userId, schema.taskRecurrences.userId),
            eq(schema.taskSchedules.taskId, schema.taskRecurrences.taskId),
          ),
        )
        .where(
          and(
            eq(schema.taskRecurrences.userId, userId),
            eq(schema.tasks.userId, userId),
            eq(schema.tasks.status, "open"),
            isNull(schema.tasks.deletedAt),
            or(dateCutoverOverlap(range), instantCutoverOverlap(range)),
          ),
        )
        .orderBy(asc(schema.taskRecurrences.taskId))
        .limit(range.limit + 1);
      return { items: rows.slice(0, range.limit), truncated: rows.length > range.limit };
    },
  } as const;
}

function cutoverValues(cutover: RecurrenceCutoverWrite) {
  return cutover.kind === "all_day"
    ? {
        projectionStartDate: cutover.projectionStartDate,
        projectionStartAt: null,
        projectionEndDate: cutover.projectionEndDate,
        projectionEndAt: null,
      }
    : {
        projectionStartDate: null,
        projectionStartAt: cutover.projectionStartAt,
        projectionEndDate: null,
        projectionEndAt: cutover.projectionEndAt,
      };
}

function dateCutoverOverlap(range: RecurrenceRange) {
  return and(
    lt(schema.taskRecurrences.projectionStartDate, range.rangeEndDate),
    or(
      isNull(schema.taskRecurrences.projectionEndDate),
      gt(schema.taskRecurrences.projectionEndDate, range.rangeStartDate),
    ),
  );
}

function instantCutoverOverlap(range: RecurrenceRange) {
  return and(
    lt(schema.taskRecurrences.projectionStartAt, range.rangeEndAt),
    or(
      isNull(schema.taskRecurrences.projectionEndAt),
      gt(schema.taskRecurrences.projectionEndAt, range.rangeStartAt),
    ),
  );
}

function assertSourceLimit(limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new RangeError("Recurrence source limit must be between 1 and 500.");
  }
}
