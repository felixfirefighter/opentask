import { Temporal } from "temporal-polyfill";

export const RECURRENCE_INTERVAL_MIN = 1;
export const RECURRENCE_INTERVAL_MAX = 99;
export const RECURRENCE_COUNT_MIN = 1;
export const RECURRENCE_COUNT_MAX = 999;

export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type RecurrencePreset =
  | Readonly<{ kind: "daily"; interval: number }>
  | Readonly<{ kind: "weekdays"; interval: number }>
  | Readonly<{ kind: "weekly"; interval: number; weekdays: readonly IsoWeekday[] }>
  | Readonly<{ kind: "monthly"; interval: number }>
  | Readonly<{ kind: "yearly"; interval: number }>;

export type RecurrenceEnd =
  | Readonly<{ kind: "never" }>
  | Readonly<{ kind: "count"; count: number }>
  | Readonly<{ kind: "until"; untilDate: string }>;

export type RecurrenceRule = Readonly<{
  preset: RecurrencePreset;
  end: RecurrenceEnd;
}>;

export function assertRecurrenceRule(rule: RecurrenceRule): void {
  assertBoundedInteger(
    rule.preset.interval,
    RECURRENCE_INTERVAL_MIN,
    RECURRENCE_INTERVAL_MAX,
    "Recurrence interval",
  );

  if (rule.preset.kind === "weekly") assertCanonicalWeekdays(rule.preset.weekdays);

  if (rule.end.kind === "count") {
    assertBoundedInteger(rule.end.count, RECURRENCE_COUNT_MIN, RECURRENCE_COUNT_MAX, "Recurrence count");
  } else if (rule.end.kind === "until") {
    assertCanonicalLocalDate(rule.end.untilDate, "Recurrence until date");
  }
}

export function recurrencePresetIncludesAnchor(preset: RecurrencePreset, anchorDate: string): boolean {
  assertRecurrenceRule({ preset, end: { kind: "never" } });
  const dayOfWeek = Temporal.PlainDate.from(anchorDate).dayOfWeek as IsoWeekday;

  if (preset.kind === "weekdays") return dayOfWeek <= 5;
  if (preset.kind === "weekly") return preset.weekdays.includes(dayOfWeek);
  return true;
}

export function assertCanonicalLocalDate(value: string, label = "Local date"): void {
  let parsed: Temporal.PlainDate;
  try {
    parsed = Temporal.PlainDate.from(value);
  } catch {
    throw new RangeError(`${label} is invalid.`);
  }
  if (parsed.toString() !== value) throw new RangeError(`${label} must use YYYY-MM-DD format.`);
}

function assertCanonicalWeekdays(weekdays: readonly IsoWeekday[]): void {
  if (weekdays.length === 0 || weekdays.length > 7) {
    throw new RangeError("A weekly recurrence requires one to seven weekdays.");
  }

  let previous = 0;
  for (const weekday of weekdays) {
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7 || weekday <= previous) {
      throw new RangeError("Weekly weekdays must be unique ISO weekdays in ascending order.");
    }
    previous = weekday;
  }
}

function assertBoundedInteger(value: number, minimum: number, maximum: number, label: string): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
}
