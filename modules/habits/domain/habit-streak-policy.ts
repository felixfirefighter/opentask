import { Temporal } from "temporal-polyfill";

import type { HabitGoal } from "./habit-goal-policy";
import type { HabitLogForProjection } from "./habit-day-policy";
import { isSuccessfulHabitLog } from "./habit-day-policy";
import type {
  HabitDailySchedule,
  HabitSchedule,
  HabitWeekdaysSchedule,
  HabitWeeklyTargetSchedule,
} from "./habit-schedule-policy";
import { isHabitScheduledOnDate, normalizeHabitSchedule } from "./habit-schedule-policy";
import {
  canonicalHabitLocalDate,
  compareHabitLocalDates,
  habitIsoWeekEnd,
  habitIsoWeekStart,
} from "./habit-time-policy";

export type HabitStreakCounts = Readonly<{ current: number; best: number }>;

export type HabitWeeklyTargetProgress = Readonly<{
  weekStart: string;
  weekEnd: string;
  successfulDays: number;
  targetPerWeek: number;
  state: "in_progress" | "achieved";
}>;

export type HabitStreakProjection =
  | (HabitStreakCounts & Readonly<{ cadence: "day" }>)
  | (HabitStreakCounts & Readonly<{ cadence: "week"; currentWeek: HabitWeeklyTargetProgress | null }>);

type DayCadenceSchedule = HabitDailySchedule | HabitWeekdaysSchedule;

export function projectDailyHabitStreak(
  schedule: DayCadenceSchedule,
  goal: HabitGoal,
  logs: readonly HabitLogForProjection[],
  currentLocalDate: string,
): HabitStreakCounts {
  const normalized = normalizeHabitSchedule(schedule);
  if (normalized.kind === "weekly_target") {
    throw new RangeError("A weekly-target habit requires weekly streak projection.");
  }
  const currentDate = canonicalHabitLocalDate(currentLocalDate, "Current habit local date");
  const logsByDate = indexProjectionLogs(logs);
  const successfulDates = new Set(
    [...logsByDate.entries()]
      .filter(
        ([date, log]) =>
          compareHabitLocalDates(date, currentDate) <= 0 &&
          isHabitScheduledOnDate(normalized, date) &&
          isSuccessfulHabitLog(goal, log),
      )
      .map(([date]) => date),
  );

  return {
    current: currentDailyStreak(normalized, logsByDate, successfulDates, currentDate),
    best: bestConsecutiveDates(normalized, successfulDates),
  };
}

export function projectWeeklyTargetStreak(
  schedule: HabitWeeklyTargetSchedule,
  goal: HabitGoal,
  logs: readonly HabitLogForProjection[],
  currentLocalDate: string,
): HabitStreakCounts & Readonly<{ currentWeek: HabitWeeklyTargetProgress | null }> {
  const normalized = normalizeHabitSchedule(schedule);
  if (normalized.kind !== "weekly_target") {
    throw new RangeError("A day-cadence habit requires daily streak projection.");
  }
  const currentDate = canonicalHabitLocalDate(currentLocalDate, "Current habit local date");
  const logsByDate = indexProjectionLogs(logs);
  const successfulByWeek = new Map<string, Set<string>>();

  for (const [date, log] of logsByDate) {
    if (
      compareHabitLocalDates(date, currentDate) > 0 ||
      !isHabitScheduledOnDate(normalized, date) ||
      !isSuccessfulHabitLog(goal, log)
    ) {
      continue;
    }
    const weekStart = habitIsoWeekStart(date);
    const dates = successfulByWeek.get(weekStart) ?? new Set<string>();
    dates.add(date);
    successfulByWeek.set(weekStart, dates);
  }

  const successfulWeeks = new Set(
    [...successfulByWeek.entries()]
      .filter(([, dates]) => dates.size >= normalized.targetPerWeek)
      .map(([weekStart]) => weekStart),
  );
  const latestWeek = latestEligibleWeek(normalized, currentDate);
  const currentWeekStart = habitIsoWeekStart(currentDate);

  return {
    current:
      latestWeek === null
        ? 0
        : currentWeeklyStreak(normalized, successfulWeeks, latestWeek, latestWeek === currentWeekStart),
    best: bestConsecutiveWeeks(successfulWeeks),
    currentWeek: projectCurrentWeeklyProgress(
      normalized,
      successfulByWeek.get(currentWeekStart)?.size ?? 0,
      currentDate,
    ),
  };
}

export function projectHabitStreaks(
  schedule: HabitSchedule,
  goal: HabitGoal,
  logs: readonly HabitLogForProjection[],
  currentLocalDate: string,
): HabitStreakProjection {
  if (schedule.kind === "weekly_target") {
    const projection = projectWeeklyTargetStreak(schedule, goal, logs, currentLocalDate);
    return { cadence: "week", ...projection };
  }
  return { cadence: "day", ...projectDailyHabitStreak(schedule, goal, logs, currentLocalDate) };
}

function currentDailyStreak(
  schedule: DayCadenceSchedule,
  logsByDate: ReadonlyMap<string, HabitLogForProjection>,
  successfulDates: ReadonlySet<string>,
  currentDate: string,
): number {
  const upperBound =
    schedule.endDate !== null && compareHabitLocalDates(schedule.endDate, currentDate) < 0
      ? schedule.endDate
      : currentDate;
  let cursor = latestScheduledDate(schedule, upperBound);
  if (cursor === null) return 0;

  if (cursor === currentDate && !successfulDates.has(cursor)) {
    const log = logsByDate.get(cursor);
    if (log?.state === "skipped" || log?.state === "unachieved") return 0;
    cursor = previousScheduledDate(schedule, cursor);
  } else if (!successfulDates.has(cursor)) {
    return 0;
  }

  let current = 0;
  while (cursor !== null && successfulDates.has(cursor)) {
    current += 1;
    cursor = previousScheduledDate(schedule, cursor);
  }
  return current;
}

function bestConsecutiveDates(schedule: DayCadenceSchedule, successfulDates: ReadonlySet<string>): number {
  const dates = [...successfulDates].sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of dates) {
    run = previous !== null && nextScheduledDate(schedule, previous) === date ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }
  return best;
}

function currentWeeklyStreak(
  schedule: HabitWeeklyTargetSchedule,
  successfulWeeks: ReadonlySet<string>,
  latestWeek: string,
  latestWeekIsOpen: boolean,
): number {
  let cursor = latestWeek;
  if (latestWeekIsOpen && !successfulWeeks.has(cursor)) {
    cursor = Temporal.PlainDate.from(cursor).subtract({ days: 7 }).toString();
  } else if (!successfulWeeks.has(cursor)) {
    return 0;
  }

  const firstWeek = habitIsoWeekStart(schedule.startDate);
  let current = 0;
  while (compareHabitLocalDates(cursor, firstWeek) >= 0 && successfulWeeks.has(cursor)) {
    current += 1;
    cursor = Temporal.PlainDate.from(cursor).subtract({ days: 7 }).toString();
  }
  return current;
}

function bestConsecutiveWeeks(successfulWeeks: ReadonlySet<string>): number {
  const weeks = [...successfulWeeks].sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const week of weeks) {
    const expected = previous === null ? null : Temporal.PlainDate.from(previous).add({ days: 7 }).toString();
    run = expected === week ? run + 1 : 1;
    best = Math.max(best, run);
    previous = week;
  }
  return best;
}

function projectCurrentWeeklyProgress(
  schedule: HabitWeeklyTargetSchedule,
  successfulDays: number,
  currentDate: string,
): HabitWeeklyTargetProgress | null {
  if (!isHabitScheduledOnDate(schedule, currentDate)) return null;
  return {
    weekStart: habitIsoWeekStart(currentDate),
    weekEnd: habitIsoWeekEnd(currentDate),
    successfulDays,
    targetPerWeek: schedule.targetPerWeek,
    state: successfulDays >= schedule.targetPerWeek ? "achieved" : "in_progress",
  };
}

function latestEligibleWeek(schedule: HabitWeeklyTargetSchedule, currentDate: string): string | null {
  if (compareHabitLocalDates(currentDate, schedule.startDate) < 0) return null;
  const latestDate =
    schedule.endDate !== null && compareHabitLocalDates(schedule.endDate, currentDate) < 0
      ? schedule.endDate
      : currentDate;
  return habitIsoWeekStart(latestDate);
}

function latestScheduledDate(schedule: DayCadenceSchedule, upperBound: string): string | null {
  let cursor = Temporal.PlainDate.from(upperBound);
  for (let offset = 0; offset < 7; offset += 1) {
    const date = cursor.toString();
    if (compareHabitLocalDates(date, schedule.startDate) < 0) return null;
    if (isHabitScheduledOnDate(schedule, date)) return date;
    cursor = cursor.subtract({ days: 1 });
  }
  return null;
}

function previousScheduledDate(schedule: DayCadenceSchedule, date: string): string | null {
  return latestScheduledDate(schedule, Temporal.PlainDate.from(date).subtract({ days: 1 }).toString());
}

function nextScheduledDate(schedule: DayCadenceSchedule, date: string): string | null {
  let cursor = Temporal.PlainDate.from(date);
  for (let offset = 0; offset < 7; offset += 1) {
    cursor = cursor.add({ days: 1 });
    const next = cursor.toString();
    if (schedule.endDate !== null && compareHabitLocalDates(next, schedule.endDate) > 0) return null;
    if (isHabitScheduledOnDate(schedule, next)) return next;
  }
  return null;
}

function indexProjectionLogs(
  logs: readonly HabitLogForProjection[],
): ReadonlyMap<string, HabitLogForProjection> {
  const indexed = new Map<string, HabitLogForProjection>();
  for (const log of logs) {
    const date = canonicalHabitLocalDate(log.localDate, "Habit log local date");
    if (indexed.has(date)) throw new RangeError("Habit streak input contains duplicate local dates.");
    indexed.set(date, { ...log, localDate: date });
  }
  return indexed;
}
