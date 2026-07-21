import { and, asc, eq, gt, gte, inArray, lte, or, sql } from "drizzle-orm";

import { getDatabase, type DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

import { HABIT_PAGE_MAX_ITEMS } from "../domain/habit-limits";

export type StoredHabitLog = typeof schema.habitLogs.$inferSelect;
export type HabitLogProjectionAfter = Readonly<{ habitId: string; localDate: string; id: string }>;

export const HABIT_LOG_PROJECTION_BATCH_SIZE = 256;

export type HabitLogWrite = Readonly<{
  state: "completed" | "skipped" | "unachieved";
  quantity: number | null;
  note: string | null;
}>;

export type HabitLogWriteResult =
  | Readonly<{ outcome: "applied"; log: StoredHabitLog }>
  | Readonly<{ outcome: "not-found" }>
  | Readonly<{ outcome: "stale"; currentVersion: number }>;

export function createHabitLogRepository(defaultExecutor: DatabaseExecutor = getDatabase()) {
  return {
    async findById(
      userId: string,
      id: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredHabitLog | null> {
      const [row] = await executor
        .select()
        .from(schema.habitLogs)
        .where(and(eq(schema.habitLogs.userId, userId), eq(schema.habitLogs.id, id)))
        .limit(1);
      return row ?? null;
    },

    async lockById(
      userId: string,
      id: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredHabitLog | null> {
      const [row] = await executor
        .select()
        .from(schema.habitLogs)
        .where(and(eq(schema.habitLogs.userId, userId), eq(schema.habitLogs.id, id)))
        .limit(1)
        .for("update");
      return row ?? null;
    },

    async findByHabitDate(
      userId: string,
      habitId: string,
      localDate: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredHabitLog | null> {
      const [row] = await executor
        .select()
        .from(schema.habitLogs)
        .where(
          and(
            eq(schema.habitLogs.userId, userId),
            eq(schema.habitLogs.habitId, habitId),
            eq(schema.habitLogs.localDate, localDate),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async lockByHabitDate(
      userId: string,
      habitId: string,
      localDate: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredHabitLog | null> {
      const [row] = await executor
        .select()
        .from(schema.habitLogs)
        .where(
          and(
            eq(schema.habitLogs.userId, userId),
            eq(schema.habitLogs.habitId, habitId),
            eq(schema.habitLogs.localDate, localDate),
          ),
        )
        .limit(1)
        .for("update");
      return row ?? null;
    },

    async listRangeByHabit(
      userId: string,
      habitId: string,
      range: Readonly<{ startDate: string; endDate: string }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredHabitLog[]> {
      return executor
        .select()
        .from(schema.habitLogs)
        .where(
          and(
            eq(schema.habitLogs.userId, userId),
            eq(schema.habitLogs.habitId, habitId),
            gte(schema.habitLogs.localDate, range.startDate),
            lte(schema.habitLogs.localDate, range.endDate),
          ),
        )
        .orderBy(asc(schema.habitLogs.localDate), asc(schema.habitLogs.id));
    },

    async listProjectionPage(
      userId: string,
      habitIds: readonly string[],
      after: HabitLogProjectionAfter | undefined,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredHabitLog[]> {
      if (habitIds.length === 0) return [];
      if (habitIds.length > HABIT_PAGE_MAX_ITEMS) {
        throw new RangeError(`A habit log projection page cannot exceed ${HABIT_PAGE_MAX_ITEMS} habits.`);
      }
      return executor
        .select()
        .from(schema.habitLogs)
        .where(
          and(
            eq(schema.habitLogs.userId, userId),
            inArray(schema.habitLogs.habitId, [...habitIds]),
            after
              ? or(
                  gt(schema.habitLogs.habitId, after.habitId),
                  and(
                    eq(schema.habitLogs.habitId, after.habitId),
                    gt(schema.habitLogs.localDate, after.localDate),
                  ),
                  and(
                    eq(schema.habitLogs.habitId, after.habitId),
                    eq(schema.habitLogs.localDate, after.localDate),
                    gt(schema.habitLogs.id, after.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(asc(schema.habitLogs.habitId), asc(schema.habitLogs.localDate), asc(schema.habitLogs.id))
        .limit(HABIT_LOG_PROJECTION_BATCH_SIZE);
    },

    async insert(
      input: Readonly<{
        id: string;
        userId: string;
        habitId: string;
        localDate: string;
        value: HabitLogWrite;
        now: Date;
      }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredHabitLog | null> {
      const [row] = await executor
        .insert(schema.habitLogs)
        .values({
          id: input.id,
          userId: input.userId,
          habitId: input.habitId,
          localDate: input.localDate,
          ...input.value,
          version: 1,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .onConflictDoNothing()
        .returning();
      return row ?? null;
    },

    async update(
      input: Readonly<{
        userId: string;
        habitId: string;
        localDate: string;
        expectedVersion: number;
        value: HabitLogWrite;
        now: Date;
      }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<HabitLogWriteResult> {
      const [log] = await executor
        .update(schema.habitLogs)
        .set({ ...input.value, version: sql`${schema.habitLogs.version} + 1`, updatedAt: input.now })
        .where(
          and(
            eq(schema.habitLogs.userId, input.userId),
            eq(schema.habitLogs.habitId, input.habitId),
            eq(schema.habitLogs.localDate, input.localDate),
            eq(schema.habitLogs.version, input.expectedVersion),
          ),
        )
        .returning();
      return log ? { outcome: "applied", log } : inspectFailure(input, executor);
    },

    async remove(
      input: Readonly<{
        userId: string;
        habitId: string;
        localDate: string;
        expectedVersion: number;
      }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<HabitLogWriteResult> {
      const [log] = await executor
        .delete(schema.habitLogs)
        .where(
          and(
            eq(schema.habitLogs.userId, input.userId),
            eq(schema.habitLogs.habitId, input.habitId),
            eq(schema.habitLogs.localDate, input.localDate),
            eq(schema.habitLogs.version, input.expectedVersion),
          ),
        )
        .returning();
      return log ? { outcome: "applied", log } : inspectFailure(input, executor);
    },
  } as const;
}

async function inspectFailure(
  input: Readonly<{ userId: string; habitId: string; localDate: string; expectedVersion: number }>,
  executor: DatabaseExecutor,
): Promise<HabitLogWriteResult> {
  const [current] = await executor
    .select({ version: schema.habitLogs.version })
    .from(schema.habitLogs)
    .where(
      and(
        eq(schema.habitLogs.userId, input.userId),
        eq(schema.habitLogs.habitId, input.habitId),
        eq(schema.habitLogs.localDate, input.localDate),
      ),
    )
    .limit(1);
  if (!current) return { outcome: "not-found" };
  return { outcome: "stale", currentVersion: current.version };
}
