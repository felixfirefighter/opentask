import { Temporal } from "temporal-polyfill";

import type { HabitLogForProjection } from "./habit-day-policy";
import { isSuccessfulHabitLog } from "./habit-day-policy";
import type { HabitGoal } from "./habit-goal-policy";
import { normalizeHabitGoal } from "./habit-goal-policy";
import type {
  HabitDailySchedule,
  HabitSchedule,
  HabitWeekdaysSchedule,
  HabitWeeklyTargetSchedule,
} from "./habit-schedule-policy";
import { isHabitScheduledOnDate, normalizeHabitSchedule } from "./habit-schedule-policy";
import type { HabitStreakProjection } from "./habit-streak-policy";
import {
  canonicalHabitLocalDate,
  compareHabitLocalDates,
  habitIsoWeekEnd,
  habitIsoWeekStart,
} from "./habit-time-policy";

type DayCadenceSchedule = HabitDailySchedule | HabitWeekdaysSchedule;

export type HabitStreakAccumulator = Readonly<{
  add(log: HabitLogForProjection): void;
  finish(): HabitStreakProjection;
}>;

/**
 * Reduces one habit's effective logs without retaining lifetime history.
 *
 * Callers must add canonical logs once each in strictly ascending local-date
 * order. This lets a repository feed bounded pages while the retained state
 * remains constant-sized per habit.
 */
export function createHabitStreakAccumulator(
  schedule: HabitSchedule,
  goal: HabitGoal,
  currentLocalDate: string,
): HabitStreakAccumulator {
  const normalizedSchedule = normalizeHabitSchedule(schedule);
  const normalizedGoal = normalizeHabitGoal(goal);
  const currentDate = canonicalHabitLocalDate(currentLocalDate, "Current habit local date");
  let previousInputDate: string | null = null;
  let finishedProjection: HabitStreakProjection | null = null;

  const reducer =
    normalizedSchedule.kind === "weekly_target"
      ? createWeeklyReducer(normalizedSchedule, normalizedGoal, currentDate)
      : createDailyReducer(normalizedSchedule, normalizedGoal, currentDate);

  return {
    add(log) {
      if (finishedProjection !== null) {
        throw new RangeError("Habit streak input cannot be added after the projection is finished.");
      }
      const localDate = canonicalHabitLocalDate(log.localDate, "Habit log local date");
      if (previousInputDate !== null) {
        const comparison = compareHabitLocalDates(localDate, previousInputDate);
        if (comparison === 0) {
          throw new RangeError("Habit streak input contains duplicate local dates.");
        }
        if (comparison < 0) {
          throw new RangeError("Habit streak input must be ordered by ascending local date.");
        }
      }
      previousInputDate = localDate;
      reducer.add({ ...log, localDate });
    },

    finish() {
      finishedProjection ??= reducer.finish();
      return finishedProjection;
    },
  };
}

function createDailyReducer(
  schedule: DayCadenceSchedule,
  goal: HabitGoal,
  currentDate: string,
): HabitStreakAccumulator {
  let previousSuccessfulDate: string | null = null;
  let successfulRun = 0;
  let best = 0;
  let currentDayExplicitFailure = false;

  return {
    add(log) {
      if (
        compareHabitLocalDates(log.localDate, currentDate) > 0 ||
        !isHabitScheduledOnDate(schedule, log.localDate)
      ) {
        return;
      }

      if (isSuccessfulHabitLog(goal, log)) {
        successfulRun =
          previousSuccessfulDate !== null &&
          nextScheduledDate(schedule, previousSuccessfulDate) === log.localDate
            ? successfulRun + 1
            : 1;
        previousSuccessfulDate = log.localDate;
        best = Math.max(best, successfulRun);
        return;
      }

      if (log.localDate === currentDate && (log.state === "skipped" || log.state === "unachieved")) {
        currentDayExplicitFailure = true;
      }
    },

    finish() {
      const upperBound =
        schedule.endDate !== null && compareHabitLocalDates(schedule.endDate, currentDate) < 0
          ? schedule.endDate
          : currentDate;
      const latest = latestScheduledDate(schedule, upperBound);
      let current = 0;

      if (latest !== null) {
        if (latest === currentDate && previousSuccessfulDate !== currentDate) {
          if (!currentDayExplicitFailure) {
            const prior = previousScheduledDate(schedule, currentDate);
            current = prior !== null && previousSuccessfulDate === prior ? successfulRun : 0;
          }
        } else {
          current = previousSuccessfulDate === latest ? successfulRun : 0;
        }
      }

      return { cadence: "day", current, best };
    },
  };
}

function createWeeklyReducer(
  schedule: HabitWeeklyTargetSchedule,
  goal: HabitGoal,
  currentDate: string,
): HabitStreakAccumulator {
  const currentWeekStart = habitIsoWeekStart(currentDate);
  let pendingWeek: string | null = null;
  let pendingSuccessfulDays = 0;
  let currentWeekSuccessfulDays = 0;
  let previousSuccessfulWeek: string | null = null;
  let successfulRun = 0;
  let best = 0;
  let finalized = false;

  function finalizePendingWeek(): void {
    if (pendingWeek === null || pendingSuccessfulDays < schedule.targetPerWeek) return;
    const expected =
      previousSuccessfulWeek === null
        ? null
        : Temporal.PlainDate.from(previousSuccessfulWeek).add({ days: 7 }).toString();
    successfulRun = expected === pendingWeek ? successfulRun + 1 : 1;
    previousSuccessfulWeek = pendingWeek;
    best = Math.max(best, successfulRun);
  }

  return {
    add(log) {
      if (
        compareHabitLocalDates(log.localDate, currentDate) > 0 ||
        !isHabitScheduledOnDate(schedule, log.localDate) ||
        !isSuccessfulHabitLog(goal, log)
      ) {
        return;
      }

      const weekStart = habitIsoWeekStart(log.localDate);
      if (pendingWeek !== weekStart) {
        finalizePendingWeek();
        pendingWeek = weekStart;
        pendingSuccessfulDays = 0;
      }
      pendingSuccessfulDays += 1;
      if (weekStart === currentWeekStart) currentWeekSuccessfulDays += 1;
    },

    finish() {
      if (!finalized) {
        finalizePendingWeek();
        finalized = true;
      }

      const latestWeek = latestEligibleWeek(schedule, currentDate);
      let current = 0;
      if (latestWeek !== null) {
        if (previousSuccessfulWeek === latestWeek) {
          current = successfulRun;
        } else if (latestWeek === currentWeekStart) {
          const priorWeek = Temporal.PlainDate.from(latestWeek).subtract({ days: 7 }).toString();
          current = previousSuccessfulWeek === priorWeek ? successfulRun : 0;
        }
      }

      return {
        cadence: "week",
        current,
        best,
        currentWeek: isHabitScheduledOnDate(schedule, currentDate)
          ? {
              weekStart: currentWeekStart,
              weekEnd: habitIsoWeekEnd(currentDate),
              successfulDays: currentWeekSuccessfulDays,
              targetPerWeek: schedule.targetPerWeek,
              state: currentWeekSuccessfulDays >= schedule.targetPerWeek ? "achieved" : "in_progress",
            }
          : null,
      };
    },
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
