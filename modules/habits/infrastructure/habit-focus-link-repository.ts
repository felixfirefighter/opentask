import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDatabase, type DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

import { isDatabaseSafeHabitText } from "../domain/habit-text";

export type StoredHabitFocusLink = Readonly<{
  id: string;
  title: string;
  archivedAt: Date | null;
}>;

const selection = {
  id: schema.habits.id,
  title: schema.habits.title,
  archivedAt: schema.habits.archivedAt,
};

export function createHabitFocusLinkRepository(defaultExecutor: DatabaseExecutor = getDatabase()) {
  return {
    async readOwned(
      userId: string,
      habitId: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredHabitFocusLink | null> {
      const [row] = await executor
        .select(selection)
        .from(schema.habits)
        .where(and(eq(schema.habits.userId, userId), eq(schema.habits.id, habitId)))
        .limit(1);
      return row ?? null;
    },

    async readOwnedMany(
      userId: string,
      habitIds: readonly string[],
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredHabitFocusLink[]> {
      assertBatch(habitIds);
      if (habitIds.length === 0) return [];
      return executor
        .select(selection)
        .from(schema.habits)
        .where(and(eq(schema.habits.userId, userId), inArray(schema.habits.id, habitIds)))
        .orderBy(asc(schema.habits.id));
    },

    async searchOwned(
      userId: string,
      input: Readonly<{ q: string; limit: number }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredHabitFocusLink[]> {
      const pattern = createSearchPattern(input.q);
      assertSearchLimit(input.limit);
      return executor
        .select(selection)
        .from(schema.habits)
        .where(
          and(
            eq(schema.habits.userId, userId),
            isNull(schema.habits.archivedAt),
            sql`lower(${schema.habits.title}) like ${pattern}`,
          ),
        )
        .orderBy(asc(sql`lower(${schema.habits.title})`), asc(schema.habits.id))
        .limit(input.limit);
    },
  } as const;
}

function assertBatch(habitIds: readonly string[]): void {
  if (habitIds.length > 50 || new Set(habitIds).size !== habitIds.length) {
    throw new RangeError("Focus-link habit batches must contain at most 50 unique IDs.");
  }
}

function createSearchPattern(rawQuery: string): string {
  const query = rawQuery.trim();
  const codePointLength = Array.from(query).length;
  if (!isDatabaseSafeHabitText(query) || codePointLength < 1 || codePointLength > 120) {
    throw new RangeError("Focus-link search must contain between 1 and 120 Unicode characters.");
  }
  return `%${query.toLowerCase().replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

function assertSearchLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new RangeError("Focus-link search limit must be between 1 and 20.");
  }
}
