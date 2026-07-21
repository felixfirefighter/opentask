import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";

import {
  habitDayProjectionSchema,
  habitHistoryProjectionSchema,
  habitHistoryQuerySchema,
  habitIdSchema,
  habitLifecyclePageQuerySchema,
  habitMonthProjectionSchema,
  habitMonthQuerySchema,
  habitOverviewPageSchema,
  habitOverviewSchema,
  habitPageQuerySchema,
  habitStreakProjectionSchema,
  habitTodayProjectionSchema,
  habitTodayRowSchema,
  type HabitDayProjection,
  type HabitHistoryProjection,
  type HabitHistoryQuery,
  type HabitLifecyclePageQuery,
  type HabitMonthProjection,
  type HabitMonthQuery,
  type HabitOverview,
  type HabitOverviewPage,
  type HabitPageQuery,
  type HabitTodayProjection,
} from "./contracts";
import {
  mapHabitDetail,
  mapHabitLog,
  storedHabitGoal,
  storedHabitLog,
  storedHabitSchedule,
} from "./habit-mapper";
import {
  createHabitProjectionSourceReader,
  type HabitRangeProjectionSource,
  type HabitStreamedProjectionSource,
} from "./habit-projection-source";
import { createPostgresHabitReadSnapshot, type HabitReadSnapshot } from "./habit-read-snapshot";
import type { HabitDayProjection as DomainHabitDayProjection } from "../domain/habit-history-policy";
import {
  buildHabitHistoryRange,
  buildHabitMonth,
  buildSevenDayStrip,
  habitMonthLocalDateRange,
} from "../domain/habit-history-policy";
import { isHabitScheduledOnDate } from "../domain/habit-schedule-policy";
import type { HabitStreakProjection as DomainHabitStreakProjection } from "../domain/habit-streak-policy";
import { localDateAtInstant } from "../domain/habit-time-policy";
import type { StoredHabitSchedule } from "../infrastructure/habit-schedule-repository";

export function createHabitProjectionApplication({
  database,
  clock,
  snapshot = createPostgresHabitReadSnapshot(database),
}: {
  database: Database;
  clock: Clock;
  snapshot?: HabitReadSnapshot;
}) {
  const sources = createHabitProjectionSourceReader(database);

  return {
    async getHabitToday(
      actor: AuthenticatedActor,
      rawQuery: HabitPageQuery = {},
    ): Promise<HabitTodayProjection> {
      const query = habitPageQuerySchema.parse(rawQuery);
      return snapshot.run(async (transaction) => {
        const now = clock.now();
        const page = await sources.readPage(actor.userId, "active", query, "today", now, transaction);
        const boundaries = await sources.readActiveBoundaries(actor.userId, now, transaction);
        const rows = page.sources
          .map((source) => buildOverview(source, now))
          .filter(({ detail, localDate }) => isHabitScheduledOnDate(detail.schedule.schedule, localDate))
          .map((overview) => {
            const { today, ...row } = overview;
            return habitTodayRowSchema.parse({
              ...row,
              day: today,
              requiresAction: requiresTodayAction(overview),
            });
          });
        return habitTodayProjectionSchema.parse({ rows, boundaries, nextCursor: page.nextCursor });
      });
    },

    async listHabitOverviews(
      actor: AuthenticatedActor,
      rawQuery: HabitLifecyclePageQuery = {},
    ): Promise<HabitOverviewPage> {
      const query = habitLifecyclePageQuerySchema.parse(rawQuery);
      return snapshot.run(async (transaction) => {
        const now = clock.now();
        const page = await sources.readPage(
          actor.userId,
          query.lifecycle,
          query,
          "overviews",
          now,
          transaction,
        );
        return habitOverviewPageSchema.parse({
          items: page.sources.map((source) => buildOverview(source, now)),
          nextCursor: page.nextCursor,
        });
      });
    },

    async getHabitOverview(actor: AuthenticatedActor, rawHabitId: string): Promise<HabitOverview> {
      const habitId = habitIdSchema.parse(rawHabitId);
      return snapshot.run(async (transaction) => {
        const now = clock.now();
        return buildOverview(await sources.readOne(actor.userId, habitId, now, transaction), now);
      });
    },

    async getHabitHistory(
      actor: AuthenticatedActor,
      rawHabitId: string,
      rawQuery: HabitHistoryQuery,
    ): Promise<HabitHistoryProjection> {
      const habitId = habitIdSchema.parse(rawHabitId);
      const query = habitHistoryQuerySchema.parse(rawQuery);
      return snapshot.run(async (transaction) => {
        const source = await sources.readRange(actor.userId, habitId, query, transaction);
        const currentDate = currentHabitDate(source.schedule, clock.now());
        const days = buildHabitHistoryRange(
          storedHabitSchedule(source.schedule),
          storedHabitGoal(source.habit),
          source.logs.map(storedHabitLog),
          query.startDate,
          query.endDate,
          currentDate,
        );
        return habitHistoryProjectionSchema.parse({
          habitId,
          startDate: query.startDate,
          endDate: query.endDate,
          days: mapDays(days, source),
        });
      });
    },

    async getHabitStreaks(actor: AuthenticatedActor, rawHabitId: string) {
      const habitId = habitIdSchema.parse(rawHabitId);
      return snapshot.run(async (transaction) => {
        const now = clock.now();
        const source = await sources.readOne(actor.userId, habitId, now, transaction);
        return mapStreak(source.streak, habitId, currentHabitDate(source.schedule, now));
      });
    },

    async getHabitMonth(
      actor: AuthenticatedActor,
      rawHabitId: string,
      rawQuery: HabitMonthQuery,
    ): Promise<HabitMonthProjection> {
      const habitId = habitIdSchema.parse(rawHabitId);
      const query = habitMonthQuerySchema.parse(rawQuery);
      return snapshot.run(async (transaction) => {
        const source = await sources.readRange(
          actor.userId,
          habitId,
          habitMonthLocalDateRange(query.yearMonth),
          transaction,
        );
        const currentDate = currentHabitDate(source.schedule, clock.now());
        const projection = buildHabitMonth(
          storedHabitSchedule(source.schedule),
          storedHabitGoal(source.habit),
          source.logs.map(storedHabitLog),
          query.yearMonth,
          currentDate,
        );
        return habitMonthProjectionSchema.parse({
          habitId,
          yearMonth: projection.yearMonth,
          days: mapDays(projection.days, source),
        });
      });
    },
  } as const;
}

function buildOverview(source: HabitStreamedProjectionSource, now: Date): HabitOverview {
  const localDate = currentHabitDate(source.schedule, now);
  const schedule = storedHabitSchedule(source.schedule);
  const goal = storedHabitGoal(source.habit);
  const projectionLogs = source.logs.map(storedHabitLog);
  const sevenDay = buildSevenDayStrip(schedule, goal, projectionLogs, localDate);
  const today = sevenDay[6];
  if (!today) throw new Error("The seven-day habit projection omitted its current day.");
  return habitOverviewSchema.parse({
    detail: mapHabitDetail(source.habit, source.schedule),
    localDate,
    today: mapDay(today, source),
    streak: mapStreak(source.streak, source.habit.id, localDate),
    sevenDay: mapDays(sevenDay, source),
    weeklyProgress:
      source.streak.cadence === "week" && source.streak.currentWeek
        ? {
            completedDays: source.streak.currentWeek.successfulDays,
            targetPerWeek: source.streak.currentWeek.targetPerWeek,
            achieved: source.streak.currentWeek.state === "achieved",
            open: true,
          }
        : null,
  });
}

function mapStreak(projection: DomainHabitStreakProjection, habitId: string, currentDate: string) {
  return habitStreakProjectionSchema.parse({
    habitId,
    cadence: projection.cadence,
    current: projection.current,
    best: projection.best,
    evaluatedThrough: currentDate,
  });
}

function mapDays(
  days: readonly DomainHabitDayProjection[],
  source: HabitRangeProjectionSource | HabitStreamedProjectionSource,
): HabitDayProjection[] {
  return days.map((day) => mapDay(day, source));
}

function mapDay(
  day: DomainHabitDayProjection,
  source: HabitRangeProjectionSource | HabitStreamedProjectionSource,
): HabitDayProjection {
  const stored = source.logs.find(({ localDate }) => localDate === day.localDate) ?? null;
  return habitDayProjectionSchema.parse({
    localDate: day.localDate,
    scheduled: day.scheduled,
    status: day.state,
    successful: day.successful,
    log: stored ? mapHabitLog(stored, storedHabitGoal(source.habit)) : null,
  });
}

function requiresTodayAction(overview: HabitOverview): boolean {
  if (overview.weeklyProgress?.achieved) return false;
  return overview.today.status === "open" || overview.today.status === "partial";
}

function currentHabitDate(schedule: StoredHabitSchedule, now: Date): string {
  return localDateAtInstant(now.toISOString(), schedule.timezone);
}
