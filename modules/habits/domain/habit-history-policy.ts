import { Temporal } from "temporal-polyfill";

import type { HabitGoal } from "./habit-goal-policy";
import type { HabitDayOutcome, HabitLogForProjection } from "./habit-day-policy";
import { classifyHabitDay } from "./habit-day-policy";
import type { HabitSchedule } from "./habit-schedule-policy";
import { isHabitScheduledOnDate, normalizeHabitSchedule } from "./habit-schedule-policy";
import {
  HABIT_LOCAL_DATE_MAX,
  HABIT_LOCAL_DATE_MIN,
  canonicalHabitLocalDate,
  compareHabitLocalDates,
} from "./habit-time-policy";

export const HABIT_HISTORY_MAX_DAYS = 366;

export type HabitDayProjectionState = HabitDayOutcome | "open" | "future" | "not_scheduled" | "outside_range";

export type HabitDayProjection = Readonly<{
  localDate: string;
  state: HabitDayProjectionState;
  scheduled: boolean;
  successful: boolean;
  quantity: number | null;
}>;

export type HabitMonthProjection = Readonly<{
  yearMonth: string;
  days: readonly HabitDayProjection[];
  recordedDays: number;
}>;

export type HabitLocalDateRange = Readonly<{ startDate: string; endDate: string }>;

export function buildSevenDayStrip(
  schedule: HabitSchedule,
  goal: HabitGoal,
  logs: readonly HabitLogForProjection[],
  throughLocalDate: string,
): readonly HabitDayProjection[] {
  const throughDate = Temporal.PlainDate.from(
    canonicalHabitLocalDate(throughLocalDate, "Seven-day strip end date"),
  );
  const startDate = throughDate.subtract({ days: 6 });
  return buildHabitHistoryRange(
    schedule,
    goal,
    logs,
    startDate.toString(),
    throughDate.toString(),
    throughDate.toString(),
  );
}

export function buildHabitMonth(
  schedule: HabitSchedule,
  goal: HabitGoal,
  logs: readonly HabitLogForProjection[],
  yearMonth: string,
  currentLocalDate: string,
): HabitMonthProjection {
  const monthRange = habitMonthLocalDateRange(yearMonth);
  const month = monthRange.startDate.slice(0, 7);
  const currentDate = canonicalHabitLocalDate(currentLocalDate, "Current habit local date");
  const days = buildHabitHistoryRange(
    schedule,
    goal,
    logs,
    monthRange.startDate,
    monthRange.endDate,
    currentDate,
  );

  return {
    yearMonth: month,
    days,
    recordedDays: days.filter((day) => isRecordedProjectionState(day.state)).length,
  };
}

export function habitMonthLocalDateRange(yearMonth: string): HabitLocalDateRange {
  const month = canonicalHabitYearMonth(yearMonth);
  const firstDate = Temporal.PlainDate.from(`${month}-01`);
  return {
    startDate: firstDate.toString(),
    endDate: firstDate.add({ days: firstDate.daysInMonth - 1 }).toString(),
  };
}

export function buildHabitHistoryRange(
  schedule: HabitSchedule,
  goal: HabitGoal,
  logs: readonly HabitLogForProjection[],
  startLocalDate: string,
  endLocalDate: string,
  currentLocalDate: string,
): readonly HabitDayProjection[] {
  const startDate = Temporal.PlainDate.from(
    canonicalHabitLocalDate(startLocalDate, "Habit history start date"),
  );
  const endDate = Temporal.PlainDate.from(canonicalHabitLocalDate(endLocalDate, "Habit history end date"));
  const currentDate = canonicalHabitLocalDate(currentLocalDate, "Current habit local date");
  const spanDays = startDate.until(endDate).days;
  if (spanDays < 0) throw new RangeError("A habit history range cannot end before it starts.");
  if (spanDays + 1 > HABIT_HISTORY_MAX_DAYS) {
    throw new RangeError(`A habit history range cannot exceed ${HABIT_HISTORY_MAX_DAYS} local days.`);
  }

  const indexed = indexHistoryLogs(logs);
  const normalized = normalizeHabitSchedule(schedule);
  return Array.from({ length: spanDays + 1 }, (_, offset) => {
    const date = startDate.add({ days: offset }).toString();
    return projectHabitDay(normalized, goal, indexed.get(date), date, currentDate);
  });
}

function projectHabitDay(
  schedule: HabitSchedule,
  goal: HabitGoal,
  log: HabitLogForProjection | undefined,
  localDate: string,
  currentDate: string,
): HabitDayProjection {
  const scheduled = isHabitScheduledOnDate(schedule, localDate);
  if (log !== undefined) {
    const state = classifyHabitDay(goal, log);
    return {
      localDate,
      state,
      scheduled,
      successful: state === "successful",
      quantity: log.quantity,
    };
  }

  const state = unrecordedDayState(schedule, localDate, currentDate, scheduled);
  return { localDate, state, scheduled, successful: false, quantity: null };
}

function unrecordedDayState(
  schedule: HabitSchedule,
  localDate: string,
  currentDate: string,
  scheduled: boolean,
): HabitDayProjectionState {
  if (
    compareHabitLocalDates(localDate, schedule.startDate) < 0 ||
    (schedule.endDate !== null && compareHabitLocalDates(localDate, schedule.endDate) > 0)
  ) {
    return "outside_range";
  }
  if (!scheduled) return "not_scheduled";
  if (compareHabitLocalDates(localDate, currentDate) > 0) return "future";
  return "open";
}

function canonicalHabitYearMonth(value: string): string {
  let parsed: Temporal.PlainYearMonth;
  try {
    parsed = Temporal.PlainYearMonth.from(value);
  } catch {
    throw new RangeError("The habit history month is invalid.");
  }
  if (parsed.toString() !== value) {
    throw new RangeError("The habit history month must use YYYY-MM format.");
  }
  if (value < HABIT_LOCAL_DATE_MIN.slice(0, 7) || value > HABIT_LOCAL_DATE_MAX.slice(0, 7)) {
    throw new RangeError("The habit history month is outside the supported date range.");
  }
  return value;
}

function isRecordedProjectionState(state: HabitDayProjectionState): state is HabitDayOutcome {
  return state === "successful" || state === "partial" || state === "skipped" || state === "unachieved";
}

function indexHistoryLogs(
  logs: readonly HabitLogForProjection[],
): ReadonlyMap<string, HabitLogForProjection> {
  const indexed = new Map<string, HabitLogForProjection>();
  for (const log of logs) {
    const date = canonicalHabitLocalDate(log.localDate, "Habit log local date");
    if (indexed.has(date)) throw new RangeError("Habit history input contains duplicate local dates.");
    indexed.set(date, { ...log, localDate: date });
  }
  return indexed;
}
