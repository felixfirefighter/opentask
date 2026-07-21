import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { getDatabase, type DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";
import { CANONICAL_IANA_TIME_ZONES } from "@/shared/validation/canonical-time-zones";

import { HABIT_PAGE_MAX_ITEMS } from "../domain/habit-limits";

export type StoredHabitSchedule = typeof schema.habitSchedules.$inferSelect;

export type HabitScheduleWrite =
  | Readonly<{
      kind: "daily";
      weekdays: null;
      targetPerWeek: null;
      timezone: string;
      startDate: string;
      endDate: string | null;
    }>
  | Readonly<{
      kind: "weekdays";
      weekdays: number[];
      targetPerWeek: null;
      timezone: string;
      startDate: string;
      endDate: string | null;
    }>
  | Readonly<{
      kind: "weekly_target";
      weekdays: null;
      targetPerWeek: number;
      timezone: string;
      startDate: string;
      endDate: string | null;
    }>;

export function createHabitScheduleRepository(defaultExecutor: DatabaseExecutor = getDatabase()) {
  return {
    async findByHabitId(
      userId: string,
      habitId: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredHabitSchedule | null> {
      const [row] = await executor
        .select()
        .from(schema.habitSchedules)
        .where(and(eq(schema.habitSchedules.userId, userId), eq(schema.habitSchedules.habitId, habitId)))
        .limit(1);
      return row ?? null;
    },

    async lockByHabitId(
      userId: string,
      habitId: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredHabitSchedule | null> {
      const [row] = await executor
        .select()
        .from(schema.habitSchedules)
        .where(and(eq(schema.habitSchedules.userId, userId), eq(schema.habitSchedules.habitId, habitId)))
        .limit(1)
        .for("update");
      return row ?? null;
    },

    async listForHabitIds(
      userId: string,
      habitIds: readonly string[],
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredHabitSchedule[]> {
      if (habitIds.length === 0) return [];
      if (habitIds.length > HABIT_PAGE_MAX_ITEMS) {
        throw new RangeError(`A habit schedule page cannot exceed ${HABIT_PAGE_MAX_ITEMS} habits.`);
      }
      return executor
        .select()
        .from(schema.habitSchedules)
        .where(
          and(
            eq(schema.habitSchedules.userId, userId),
            inArray(schema.habitSchedules.habitId, [...habitIds]),
          ),
        )
        .orderBy(asc(schema.habitSchedules.habitId));
    },

    async listDistinctActiveTimezones(
      userId: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<string[]> {
      const rows = await executor
        .selectDistinct({ timezone: schema.habitSchedules.timezone })
        .from(schema.habitSchedules)
        .innerJoin(
          schema.habits,
          and(
            eq(schema.habits.userId, schema.habitSchedules.userId),
            eq(schema.habits.id, schema.habitSchedules.habitId),
          ),
        )
        .where(and(eq(schema.habitSchedules.userId, userId), isNull(schema.habits.archivedAt)))
        .orderBy(asc(schema.habitSchedules.timezone))
        .limit(CANONICAL_IANA_TIME_ZONES.length + 1);
      if (rows.length > CANONICAL_IANA_TIME_ZONES.length) {
        throw new Error("Stored habit timezones exceeded the canonical timezone universe.");
      }
      return rows.map(({ timezone }) => timezone);
    },

    async insert(
      input: Readonly<{
        userId: string;
        habitId: string;
        schedule: HabitScheduleWrite;
        now: Date;
      }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredHabitSchedule | null> {
      const [row] = await executor
        .insert(schema.habitSchedules)
        .values({
          userId: input.userId,
          habitId: input.habitId,
          ...input.schedule,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .onConflictDoNothing({
          target: [schema.habitSchedules.userId, schema.habitSchedules.habitId],
        })
        .returning();
      return row ?? null;
    },

    async replace(
      input: Readonly<{
        userId: string;
        habitId: string;
        schedule: HabitScheduleWrite;
        now: Date;
      }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredHabitSchedule | null> {
      const [row] = await executor
        .update(schema.habitSchedules)
        .set({ ...input.schedule, updatedAt: input.now })
        .where(
          and(
            eq(schema.habitSchedules.userId, input.userId),
            eq(schema.habitSchedules.habitId, input.habitId),
          ),
        )
        .returning();
      return row ?? null;
    },
  } as const;
}
