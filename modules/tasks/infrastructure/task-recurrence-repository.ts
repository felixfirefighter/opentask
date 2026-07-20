import { Temporal } from "temporal-polyfill";

import { and, asc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";

import { getDatabase, type DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

import {
  MAX_OCCURRENCE_EVENTS_PER_REQUEST,
  MAX_RECURRENCE_ROWS_PER_REQUEST,
} from "../domain/recurrence/recurrence-limits";
import { MAX_RECURRENCE_DURATION_DAYS } from "../domain/recurrence/recurrence-time-policy";

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

type RecurrenceRangeReadOptions = Readonly<{
  lockForUpdate?: boolean;
  serializeReads?: boolean;
}>;

type PaddedRecurrenceRange = RecurrenceRange &
  Readonly<{
    paddedRangeStartDate: string;
    paddedRangeStartAt: Date;
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

    async listForTaskIds(
      userId: string,
      taskIds: readonly string[],
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<readonly StoredTaskRecurrence[]> {
      if (taskIds.length === 0) return [];
      if (taskIds.length > 100 || new Set(taskIds).size !== taskIds.length) {
        throw new RangeError("Recurrence task selection must contain at most 100 unique IDs.");
      }
      return executor
        .select()
        .from(schema.taskRecurrences)
        .where(
          and(
            eq(schema.taskRecurrences.userId, userId),
            inArray(schema.taskRecurrences.taskId, [...taskIds]),
          ),
        )
        .orderBy(asc(schema.taskRecurrences.taskId));
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
      options: RecurrenceRangeReadOptions = {},
    ): Promise<StoredRecurrenceSourcePage> {
      assertSourceLimit(range.limit);
      const paddedRange = withCanonicalDurationPadding(range);
      const [allDayRows, timedRows] = options.serializeReads
        ? [
            await listSourcesByCutover(executor, userId, paddedRange, "all_day", options),
            await listSourcesByCutover(executor, userId, paddedRange, "timed", options),
          ]
        : await Promise.all([
            listSourcesByCutover(executor, userId, paddedRange, "all_day", options),
            listSourcesByCutover(executor, userId, paddedRange, "timed", options),
          ]);
      const rows = [...allDayRows, ...timedRows].sort(compareSourceTaskId);
      return {
        items: rows.slice(0, range.limit),
        truncated:
          allDayRows.length > range.limit || timedRows.length > range.limit || rows.length > range.limit,
      };
    },

    async listActiveOpenSourcesForTaskIds(
      userId: string,
      taskIds: readonly string[],
      limit: number,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredRecurrenceSourcePage> {
      if (taskIds.length === 0) return { items: [], truncated: false };
      if (taskIds.length > MAX_OCCURRENCE_EVENTS_PER_REQUEST || new Set(taskIds).size !== taskIds.length) {
        throw new RangeError(
          `Historical recurrence source selection must contain at most ${MAX_OCCURRENCE_EVENTS_PER_REQUEST} unique IDs.`,
        );
      }
      assertSourceLimit(limit);
      const rows = await defaultSourceSelection(executor)
        .where(
          and(
            eq(schema.taskRecurrences.userId, userId),
            eq(schema.tasks.userId, userId),
            eq(schema.tasks.status, "open"),
            isNull(schema.tasks.deletedAt),
            inArray(schema.taskRecurrences.taskId, [...taskIds]),
          ),
        )
        .orderBy(asc(schema.taskRecurrences.taskId))
        .limit(limit + 1);
      return { items: rows.slice(0, limit), truncated: rows.length > limit };
    },
  } as const;
}

async function listSourcesByCutover(
  executor: DatabaseExecutor,
  userId: string,
  range: PaddedRecurrenceRange,
  kind: "all_day" | "timed",
  options: RecurrenceRangeReadOptions,
): Promise<readonly StoredTaskRecurrenceSource[]> {
  const startColumn =
    kind === "all_day"
      ? schema.taskRecurrences.projectionStartDate
      : schema.taskRecurrences.projectionStartAt;
  const endColumn =
    kind === "all_day" ? schema.taskRecurrences.projectionEndDate : schema.taskRecurrences.projectionEndAt;
  const selection = defaultSourceSelection(executor)
    .where(
      and(
        eq(schema.taskRecurrences.userId, userId),
        eq(schema.tasks.userId, userId),
        eq(schema.tasks.status, "open"),
        isNull(schema.tasks.deletedAt),
        kind === "all_day" ? dateCutoverOverlap(range) : instantCutoverOverlap(range),
      ),
    )
    .orderBy(asc(startColumn), asc(endColumn), asc(schema.taskRecurrences.taskId))
    .limit(range.limit + 1);
  return options.lockForUpdate ? selection.for("update") : selection;
}

function compareSourceTaskId(left: StoredTaskRecurrenceSource, right: StoredTaskRecurrenceSource): number {
  if (left.task.id === right.task.id) return 0;
  return left.task.id < right.task.id ? -1 : 1;
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

function dateCutoverOverlap(range: PaddedRecurrenceRange) {
  return and(
    lt(schema.taskRecurrences.projectionStartDate, range.rangeEndDate),
    or(
      isNull(schema.taskRecurrences.projectionEndDate),
      gt(schema.taskRecurrences.projectionEndDate, range.paddedRangeStartDate),
    ),
  );
}

function instantCutoverOverlap(range: PaddedRecurrenceRange) {
  return and(
    lt(schema.taskRecurrences.projectionStartAt, range.rangeEndAt),
    or(
      isNull(schema.taskRecurrences.projectionEndAt),
      gt(schema.taskRecurrences.projectionEndAt, range.paddedRangeStartAt),
    ),
  );
}

function defaultSourceSelection(executor: DatabaseExecutor) {
  return executor
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
    );
}

function withCanonicalDurationPadding(range: RecurrenceRange): PaddedRecurrenceRange {
  return {
    ...range,
    paddedRangeStartDate: Temporal.PlainDate.from(range.rangeStartDate)
      .subtract({ days: MAX_RECURRENCE_DURATION_DAYS })
      .toString(),
    paddedRangeStartAt: new Date(
      range.rangeStartAt.getTime() - MAX_RECURRENCE_DURATION_DAYS * 24 * 60 * 60 * 1_000,
    ),
  };
}

function assertSourceLimit(limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_RECURRENCE_ROWS_PER_REQUEST) {
    throw new RangeError(`Recurrence source limit must be between 1 and ${MAX_RECURRENCE_ROWS_PER_REQUEST}.`);
  }
}
