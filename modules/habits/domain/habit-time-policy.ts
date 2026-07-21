import { Temporal } from "temporal-polyfill";

import { HABIT_TIMEZONE_MAX_CODE_POINTS } from "./habit-limits";

export const HABIT_LOCAL_DATE_MIN = "0001-01-01";
export const HABIT_LOCAL_DATE_MAX = "9999-12-31";

const canonicalTimeZones = new Set(["UTC", ...Intl.supportedValuesOf("timeZone")]);

export function canonicalHabitLocalDate(value: string, label = "Habit local date"): string {
  let parsed: Temporal.PlainDate;
  try {
    parsed = Temporal.PlainDate.from(value);
  } catch {
    throw new RangeError(`${label} is invalid.`);
  }
  if (parsed.toString() !== value) {
    throw new RangeError(`${label} must use YYYY-MM-DD format.`);
  }
  if (value < HABIT_LOCAL_DATE_MIN || value > HABIT_LOCAL_DATE_MAX) {
    throw new RangeError(`${label} must be between ${HABIT_LOCAL_DATE_MIN} and ${HABIT_LOCAL_DATE_MAX}.`);
  }
  return value;
}

export function assertHabitTimeZone(timezone: string): void {
  if (
    Array.from(timezone).length === 0 ||
    Array.from(timezone).length > HABIT_TIMEZONE_MAX_CODE_POINTS ||
    !canonicalTimeZones.has(timezone)
  ) {
    throw new RangeError("The habit timezone must be a canonical IANA timezone.");
  }
}

export function localDateAtInstant(instant: string, timezone: string): string {
  assertHabitTimeZone(timezone);
  try {
    return Temporal.Instant.from(instant).toZonedDateTimeISO(timezone).toPlainDate().toString();
  } catch {
    throw new RangeError("The habit instant is invalid.");
  }
}

export function compareHabitLocalDates(left: string, right: string): number {
  return Temporal.PlainDate.compare(
    canonicalHabitLocalDate(left, "Left habit local date"),
    canonicalHabitLocalDate(right, "Right habit local date"),
  );
}

export function habitIsoWeekStart(localDate: string): string {
  const date = Temporal.PlainDate.from(canonicalHabitLocalDate(localDate));
  return date.subtract({ days: date.dayOfWeek - 1 }).toString();
}

export function habitIsoWeekEnd(localDate: string): string {
  return Temporal.PlainDate.from(habitIsoWeekStart(localDate)).add({ days: 6 }).toString();
}
