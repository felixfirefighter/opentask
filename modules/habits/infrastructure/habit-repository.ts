import { and, asc, desc, eq, gt, isNotNull, isNull, lt, or, sql } from "drizzle-orm";

import { getDatabase, type DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

import { HABIT_PAGE_MAX_ITEMS } from "../domain/habit-limits";

export type StoredHabit = typeof schema.habits.$inferSelect;
export type HabitPageAfter = Readonly<{ updatedAt: Date; id: string }>;

export type HabitDefinitionWrite = Readonly<{
  title: string;
  icon: string;
  colorToken: string;
  goalKind: "boolean" | "quantity";
  targetValue: number | null;
  unit: string | null;
}>;

export type HabitWriteResult =
  | Readonly<{ outcome: "applied"; habit: StoredHabit }>
  | Readonly<{ outcome: "not-found" }>
  | Readonly<{ outcome: "stale"; currentVersion: number }>
  | Readonly<{
      outcome: "lifecycle-conflict";
      currentVersion: number;
      lifecycle: "active" | "archived";
    }>;

export function createHabitRepository(defaultExecutor: DatabaseExecutor = getDatabase()) {
  return {
    async findById(
      userId: string,
      id: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredHabit | null> {
      const [row] = await executor
        .select()
        .from(schema.habits)
        .where(and(eq(schema.habits.userId, userId), eq(schema.habits.id, id)))
        .limit(1);
      return row ?? null;
    },

    async lockById(
      userId: string,
      id: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredHabit | null> {
      const [row] = await executor
        .select()
        .from(schema.habits)
        .where(and(eq(schema.habits.userId, userId), eq(schema.habits.id, id)))
        .limit(1)
        .for("update");
      return row ?? null;
    },

    async listPageByLifecycle(
      userId: string,
      lifecycle: "active" | "archived",
      query: Readonly<{ limit: number; after?: HabitPageAfter }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredHabit[]> {
      assertHabitPageLimit(query.limit, HABIT_PAGE_MAX_ITEMS + 1);
      return executor
        .select()
        .from(schema.habits)
        .where(
          and(
            eq(schema.habits.userId, userId),
            lifecycle === "active" ? isNull(schema.habits.archivedAt) : isNotNull(schema.habits.archivedAt),
            query.after
              ? or(
                  lt(schema.habits.updatedAt, query.after.updatedAt),
                  and(
                    eq(schema.habits.updatedAt, query.after.updatedAt),
                    gt(schema.habits.id, query.after.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(schema.habits.updatedAt), asc(schema.habits.id))
        .limit(query.limit);
    },

    async findPageAnchor(
      userId: string,
      lifecycle: "active" | "archived",
      id: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<Pick<StoredHabit, "id" | "updatedAt"> | null> {
      const [row] = await executor
        .select({ id: schema.habits.id, updatedAt: schema.habits.updatedAt })
        .from(schema.habits)
        .where(
          and(
            eq(schema.habits.userId, userId),
            eq(schema.habits.id, id),
            lifecycle === "active" ? isNull(schema.habits.archivedAt) : isNotNull(schema.habits.archivedAt),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async insert(
      input: Readonly<{
        id: string;
        userId: string;
        definition: HabitDefinitionWrite;
        now: Date;
      }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredHabit | null> {
      const [row] = await executor
        .insert(schema.habits)
        .values({
          id: input.id,
          userId: input.userId,
          ...input.definition,
          version: 1,
          createdAt: input.now,
          updatedAt: input.now,
          archivedAt: null,
        })
        .onConflictDoNothing({ target: [schema.habits.userId, schema.habits.id] })
        .returning();
      return row ?? null;
    },

    async updateDefinition(
      input: Readonly<{
        userId: string;
        id: string;
        expectedVersion: number;
        definition: HabitDefinitionWrite;
        now: Date;
      }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<HabitWriteResult> {
      const [habit] = await executor
        .update(schema.habits)
        .set({
          ...input.definition,
          version: sql`${schema.habits.version} + 1`,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(schema.habits.userId, input.userId),
            eq(schema.habits.id, input.id),
            eq(schema.habits.version, input.expectedVersion),
            isNull(schema.habits.archivedAt),
          ),
        )
        .returning();
      return habit ? { outcome: "applied", habit } : inspectWriteFailure(input, executor);
    },

    async incrementVersion(
      input: Readonly<{ userId: string; id: string; expectedVersion: number; now: Date }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<HabitWriteResult> {
      const [habit] = await executor
        .update(schema.habits)
        .set({ version: sql`${schema.habits.version} + 1`, updatedAt: input.now })
        .where(
          and(
            eq(schema.habits.userId, input.userId),
            eq(schema.habits.id, input.id),
            eq(schema.habits.version, input.expectedVersion),
            isNull(schema.habits.archivedAt),
          ),
        )
        .returning();
      return habit ? { outcome: "applied", habit } : inspectWriteFailure(input, executor);
    },

    async archive(
      input: Readonly<{ userId: string; id: string; expectedVersion: number; now: Date }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<HabitWriteResult> {
      const [habit] = await executor
        .update(schema.habits)
        .set({
          archivedAt: input.now,
          version: sql`${schema.habits.version} + 1`,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(schema.habits.userId, input.userId),
            eq(schema.habits.id, input.id),
            eq(schema.habits.version, input.expectedVersion),
            isNull(schema.habits.archivedAt),
          ),
        )
        .returning();
      return habit ? { outcome: "applied", habit } : inspectWriteFailure(input, executor);
    },

    async restore(
      input: Readonly<{ userId: string; id: string; expectedVersion: number; now: Date }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<HabitWriteResult> {
      const [habit] = await executor
        .update(schema.habits)
        .set({
          archivedAt: null,
          version: sql`${schema.habits.version} + 1`,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(schema.habits.userId, input.userId),
            eq(schema.habits.id, input.id),
            eq(schema.habits.version, input.expectedVersion),
            isNotNull(schema.habits.archivedAt),
          ),
        )
        .returning();
      return habit ? { outcome: "applied", habit } : inspectWriteFailure(input, executor);
    },
  } as const;
}

function assertHabitPageLimit(limit: number, maximum: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > maximum) {
    throw new RangeError(`Habit repository page limit must be from 1 through ${maximum}.`);
  }
}

async function inspectWriteFailure(
  input: Readonly<{ userId: string; id: string; expectedVersion: number }>,
  executor: DatabaseExecutor,
): Promise<HabitWriteResult> {
  const [current] = await executor
    .select({ version: schema.habits.version, archivedAt: schema.habits.archivedAt })
    .from(schema.habits)
    .where(and(eq(schema.habits.userId, input.userId), eq(schema.habits.id, input.id)))
    .limit(1);
  if (!current) return { outcome: "not-found" };
  if (current.version !== input.expectedVersion) {
    return { outcome: "stale", currentVersion: current.version };
  }
  return {
    outcome: "lifecycle-conflict",
    currentVersion: current.version,
    lifecycle: current.archivedAt === null ? "active" : "archived",
  };
}
