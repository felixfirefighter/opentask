import { Temporal } from "temporal-polyfill";

import type { DatabaseExecutor } from "@/shared/db/client";

import { habitNotFound } from "./habit-errors";
import {
  decodeHabitPageCursor,
  habitPageAfter,
  habitPageFromRows,
  type HabitPageCursorScope,
} from "./habit-page-cursor";
import { storedHabitGoal, storedHabitLog, storedHabitSchedule } from "./habit-mapper";
import { createHabitStreakAccumulator } from "../domain/habit-streak-accumulator";
import type { HabitStreakProjection as DomainHabitStreakProjection } from "../domain/habit-streak-policy";
import { localDateAtInstant } from "../domain/habit-time-policy";
import {
  HABIT_LOG_PROJECTION_BATCH_SIZE,
  type StoredHabitLog,
  createHabitLogRepository,
} from "../infrastructure/habit-log-repository";
import { createHabitRepository, type StoredHabit } from "../infrastructure/habit-repository";
import {
  createHabitScheduleRepository,
  type StoredHabitSchedule,
} from "../infrastructure/habit-schedule-repository";

export type HabitStreamedProjectionSource = Readonly<{
  habit: StoredHabit;
  schedule: StoredHabitSchedule;
  logs: readonly StoredHabitLog[];
  streak: DomainHabitStreakProjection;
}>;

export type HabitRangeProjectionSource = Readonly<{
  habit: StoredHabit;
  schedule: StoredHabitSchedule;
  logs: readonly StoredHabitLog[];
}>;

type ParsedHabitPageQuery = Readonly<{ limit: number; cursor?: string | undefined }>;

export function createHabitProjectionSourceReader(defaultExecutor: DatabaseExecutor) {
  const habits = createHabitRepository(defaultExecutor);
  const schedules = createHabitScheduleRepository(defaultExecutor);
  const logs = createHabitLogRepository(defaultExecutor);

  return {
    async readPage(
      userId: string,
      lifecycle: "active" | "archived",
      query: ParsedHabitPageQuery,
      scope: HabitPageCursorScope,
      now: Date,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<Readonly<{ sources: HabitStreamedProjectionSource[]; nextCursor: string | null }>> {
      const cursor = decodeHabitPageCursor(query.cursor, scope, lifecycle);
      const anchor = cursor ? await habits.findPageAnchor(userId, lifecycle, cursor.id, executor) : null;
      const after = habitPageAfter(cursor, anchor);
      const page = habitPageFromRows(
        await habits.listPageByLifecycle(
          userId,
          lifecycle,
          { limit: query.limit + 1, ...(after ? { after } : {}) },
          executor,
        ),
        query.limit,
        scope,
        lifecycle,
      );
      return {
        sources: await hydrateStreamedSources(userId, page.items, now, executor),
        nextCursor: page.nextCursor,
      };
    },

    async readOne(
      userId: string,
      habitId: string,
      now: Date,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<HabitStreamedProjectionSource> {
      const habit = await habits.findById(userId, habitId, executor);
      if (!habit) throw habitNotFound();
      const [source] = await hydrateStreamedSources(userId, [habit], now, executor);
      if (!source) throw new Error("The stored habit projection could not be hydrated.");
      return source;
    },

    async readRange(
      userId: string,
      habitId: string,
      range: Readonly<{ startDate: string; endDate: string }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<HabitRangeProjectionSource> {
      const habit = await habits.findById(userId, habitId, executor);
      if (!habit) throw habitNotFound();
      const schedule = await schedules.findByHabitId(userId, habitId, executor);
      if (!schedule) throw missingSchedule();
      return {
        habit,
        schedule,
        logs: await logs.listRangeByHabit(userId, habitId, range, executor),
      };
    },

    async readActiveBoundaries(
      userId: string,
      now: Date,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<readonly Readonly<{ timezone: string; localDate: string }>[]> {
      const timezones = await schedules.listDistinctActiveTimezones(userId, executor);
      return timezones.map((timezone) => ({
        timezone,
        localDate: localDateAtInstant(now.toISOString(), timezone),
      }));
    },
  } as const;

  async function hydrateStreamedSources(
    userId: string,
    habitRows: readonly StoredHabit[],
    now: Date,
    executor: DatabaseExecutor,
  ): Promise<HabitStreamedProjectionSource[]> {
    const habitIds = habitRows.map(({ id }) => id);
    const scheduleRows = await schedules.listForHabitIds(userId, habitIds, executor);
    const schedulesByHabit = new Map(scheduleRows.map((row) => [row.habitId, row]));
    const states = new Map(
      habitRows.map((habit) => {
        const schedule = schedulesByHabit.get(habit.id);
        if (!schedule) throw missingSchedule();
        const currentDate = currentHabitDate(schedule, now);
        return [
          habit.id,
          {
            habit,
            schedule,
            currentDate,
            recentStart: Temporal.PlainDate.from(currentDate).subtract({ days: 6 }).toString(),
            recentLogs: [] as StoredHabitLog[],
            streak: createHabitStreakAccumulator(
              storedHabitSchedule(schedule),
              storedHabitGoal(habit),
              currentDate,
            ),
          },
        ] as const;
      }),
    );

    let after: Readonly<{ habitId: string; localDate: string; id: string }> | undefined;
    while (habitIds.length > 0) {
      const page = await logs.listProjectionPage(userId, habitIds, after, executor);
      for (const row of page) {
        const state = states.get(row.habitId);
        if (!state) throw new Error("A habit log projection row had no page-owned habit.");
        state.streak.add(storedHabitLog(row));
        if (row.localDate >= state.recentStart && row.localDate <= state.currentDate) {
          state.recentLogs.push(row);
          if (state.recentLogs.length > 7) {
            throw new Error("A habit projection retained more than seven recent local-day logs.");
          }
        }
      }
      const last = page.at(-1);
      if (page.length < HABIT_LOG_PROJECTION_BATCH_SIZE || !last) break;
      after = { habitId: last.habitId, localDate: last.localDate, id: last.id };
    }

    return habitRows.map((habit) => {
      const state = states.get(habit.id);
      if (!state) throw new Error("A habit projection state was not initialized.");
      return {
        habit: state.habit,
        schedule: state.schedule,
        logs: state.recentLogs,
        streak: state.streak.finish(),
      };
    });
  }
}

function currentHabitDate(schedule: StoredHabitSchedule, now: Date): string {
  return localDateAtInstant(now.toISOString(), schedule.timezone);
}

function missingSchedule(): Error {
  return new Error("A stored habit is missing its required schedule.");
}
