import { Temporal } from "temporal-polyfill";

import { HABIT_WEEKLY_TARGET_MAX, HABIT_WEEKLY_TARGET_MIN } from "./habit-limits";
import { assertHabitTimeZone, canonicalHabitLocalDate, compareHabitLocalDates } from "./habit-time-policy";

export type HabitIsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type HabitScheduleBounds = Readonly<{
  timezone: string;
  startDate: string;
  endDate: string | null;
}>;

export type HabitDailySchedule = HabitScheduleBounds &
  Readonly<{ kind: "daily"; weekdays: null; targetPerWeek: null }>;
export type HabitWeekdaysSchedule = HabitScheduleBounds &
  Readonly<{ kind: "weekdays"; weekdays: readonly HabitIsoWeekday[]; targetPerWeek: null }>;
export type HabitWeeklyTargetSchedule = HabitScheduleBounds &
  Readonly<{ kind: "weekly_target"; weekdays: null; targetPerWeek: number }>;
export type HabitSchedule = HabitDailySchedule | HabitWeekdaysSchedule | HabitWeeklyTargetSchedule;

export function normalizeHabitSchedule(schedule: HabitSchedule): HabitSchedule {
  assertHabitTimeZone(schedule.timezone);
  const startDate = canonicalHabitLocalDate(schedule.startDate, "Habit schedule start date");
  const endDate =
    schedule.endDate === null ? null : canonicalHabitLocalDate(schedule.endDate, "Habit schedule end date");
  if (endDate !== null && compareHabitLocalDates(endDate, startDate) < 0) {
    throw new RangeError("A habit schedule end date cannot precede its start date.");
  }

  const bounds = { timezone: schedule.timezone, startDate, endDate };
  if (schedule.kind === "daily") {
    if (schedule.weekdays !== null || schedule.targetPerWeek !== null) {
      throw new RangeError("A daily habit schedule cannot have weekday or weekly-target fields.");
    }
    return { kind: "daily", weekdays: null, targetPerWeek: null, ...bounds };
  }

  if (schedule.kind === "weekdays") {
    if (schedule.targetPerWeek !== null) {
      throw new RangeError("A selected-weekday schedule cannot have a weekly target.");
    }
    assertCanonicalHabitWeekdays(schedule.weekdays);
    return { kind: "weekdays", weekdays: [...schedule.weekdays], targetPerWeek: null, ...bounds };
  }

  if (schedule.kind === "weekly_target") {
    if (schedule.weekdays !== null) {
      throw new RangeError("A weekly-target schedule cannot have selected weekdays.");
    }
    if (
      !Number.isInteger(schedule.targetPerWeek) ||
      schedule.targetPerWeek < HABIT_WEEKLY_TARGET_MIN ||
      schedule.targetPerWeek > HABIT_WEEKLY_TARGET_MAX
    ) {
      throw new RangeError(
        `A weekly habit target must be an integer from ${HABIT_WEEKLY_TARGET_MIN} through ${HABIT_WEEKLY_TARGET_MAX}.`,
      );
    }
    return { kind: "weekly_target", weekdays: null, targetPerWeek: schedule.targetPerWeek, ...bounds };
  }

  throw new RangeError("The habit schedule kind is invalid.");
}

export function isHabitScheduledOnDate(schedule: HabitSchedule, localDate: string): boolean {
  const normalized = normalizeHabitSchedule(schedule);
  const date = canonicalHabitLocalDate(localDate);
  if (compareHabitLocalDates(date, normalized.startDate) < 0) return false;
  if (normalized.endDate !== null && compareHabitLocalDates(date, normalized.endDate) > 0) return false;
  if (normalized.kind !== "weekdays") return true;
  return normalized.weekdays.includes(Temporal.PlainDate.from(date).dayOfWeek as HabitIsoWeekday);
}

export function assertCanonicalHabitWeekdays(weekdays: readonly HabitIsoWeekday[]): void {
  if (weekdays.length < 1 || weekdays.length > 7) {
    throw new RangeError("A selected-weekday habit requires one through seven weekdays.");
  }
  let previous = 0;
  for (const weekday of weekdays) {
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7 || weekday <= previous) {
      throw new RangeError("Habit weekdays must be unique ISO weekdays in ascending order.");
    }
    previous = weekday;
  }
}
