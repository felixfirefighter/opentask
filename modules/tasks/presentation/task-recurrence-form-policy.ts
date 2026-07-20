import { Temporal } from "temporal-polyfill";

import type { TaskScheduleValue } from "../application/contracts";
import {
  editRecurringTaskScheduleRequestSchema,
  RECURRENCE_COUNT_MAX,
  RECURRENCE_COUNT_MIN,
  RECURRENCE_INTERVAL_MAX,
  RECURRENCE_INTERVAL_MIN,
  type RecurrenceDefinition,
  type RecurrencePreset,
  type TaskRecurrenceDto,
} from "../application/contracts/recurrence-contract";

export const recurrencePresetOptions = [
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Selected weekdays" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
] as const;

export const recurrenceWeekdayOptions = [
  { value: 1, shortLabel: "Mon", longLabel: "Monday" },
  { value: 2, shortLabel: "Tue", longLabel: "Tuesday" },
  { value: 3, shortLabel: "Wed", longLabel: "Wednesday" },
  { value: 4, shortLabel: "Thu", longLabel: "Thursday" },
  { value: 5, shortLabel: "Fri", longLabel: "Friday" },
  { value: 6, shortLabel: "Sat", longLabel: "Saturday" },
  { value: 7, shortLabel: "Sun", longLabel: "Sunday" },
] as const;

export type RecurrencePresetKind = (typeof recurrencePresetOptions)[number]["value"];
export type RecurrenceEndKind = "never" | "until" | "count";
export type RecurrenceWeekday = (typeof recurrenceWeekdayOptions)[number]["value"];

export type TaskRecurrenceDraft = Readonly<{
  presetKind: RecurrencePresetKind;
  interval: string;
  weekdays: readonly RecurrenceWeekday[];
  endKind: RecurrenceEndKind;
  untilDate: string;
  count: string;
}>;

export type RecurrenceDraftInterpretation =
  | Readonly<{ valid: true; definition: RecurrenceDefinition; summary: string }>
  | Readonly<{ valid: false; message: string }>;

export function createTaskRecurrenceDraft(
  recurrence: TaskRecurrenceDto | null,
  schedule: TaskScheduleValue,
  timezone: string,
): TaskRecurrenceDraft {
  const anchorDate = recurrenceAnchorDate(schedule, timezone);
  const definition = recurrence?.definition;
  return {
    presetKind: definition?.preset.kind ?? "daily",
    interval: String(definition?.preset.interval ?? 1),
    weekdays:
      definition?.preset.kind === "weekly"
        ? [...definition.preset.weekdays]
        : [Temporal.PlainDate.from(anchorDate).dayOfWeek as RecurrenceWeekday],
    endKind: definition?.end.kind ?? "never",
    untilDate: definition?.end.kind === "until" ? definition.end.untilDate : anchorDate,
    count: String(definition?.end.kind === "count" ? definition.end.count : 10),
  };
}

export function interpretTaskRecurrenceDraft(
  draft: TaskRecurrenceDraft,
  schedule: TaskScheduleValue,
  timezone: string,
  hourCycle: "h12" | "h23",
): RecurrenceDraftInterpretation {
  const interval = boundedInteger(
    draft.interval,
    RECURRENCE_INTERVAL_MIN,
    RECURRENCE_INTERVAL_MAX,
    `Interval must be a whole number from ${RECURRENCE_INTERVAL_MIN} to ${RECURRENCE_INTERVAL_MAX}.`,
  );
  if (typeof interval === "string") return { valid: false, message: interval };

  let preset: RecurrencePreset;
  if (draft.presetKind === "weekly") {
    if (draft.weekdays.length === 0) {
      return { valid: false, message: "Choose at least one weekday." };
    }
    preset = { kind: "weekly", interval, weekdays: [...draft.weekdays].sort((a, b) => a - b) };
  } else {
    preset = { kind: draft.presetKind, interval };
  }

  let end: RecurrenceDefinition["end"];
  if (draft.endKind === "count") {
    const count = boundedInteger(
      draft.count,
      RECURRENCE_COUNT_MIN,
      RECURRENCE_COUNT_MAX,
      `Occurrence count must be a whole number from ${RECURRENCE_COUNT_MIN} to ${RECURRENCE_COUNT_MAX}.`,
    );
    if (typeof count === "string") return { valid: false, message: count };
    end = { kind: "count", count };
  } else if (draft.endKind === "until") {
    if (!isCanonicalDate(draft.untilDate)) {
      return { valid: false, message: "Choose a valid inclusive end date." };
    }
    end = { kind: "until", untilDate: draft.untilDate };
  } else {
    end = { kind: "never" };
  }

  const definition = { preset, end } satisfies RecurrenceDefinition;
  const eligibility = editRecurringTaskScheduleRequestSchema.safeParse({
    expectedVersion: 1,
    definition,
    schedule: toTaskScheduleValue(schedule),
  });
  if (!eligibility.success) {
    return {
      valid: false,
      message: eligibility.error.issues[0]?.message ?? "This schedule cannot repeat with that cadence.",
    };
  }

  return {
    valid: true,
    definition,
    summary: formatRecurrenceSummary(definition, schedule, timezone, hourCycle),
  };
}

function toTaskScheduleValue(schedule: TaskScheduleValue): TaskScheduleValue {
  return schedule.kind === "all_day"
    ? { kind: "all_day", startDate: schedule.startDate, endDate: schedule.endDate }
    : {
        kind: "timed",
        startAt: schedule.startAt,
        endAt: schedule.endAt,
        timezone: schedule.timezone,
      };
}

export function formatRecurrenceSummary(
  definition: RecurrenceDefinition,
  schedule: TaskScheduleValue,
  timezone: string,
  hourCycle: "h12" | "h23",
): string {
  const cadence = formatCadence(definition.preset, recurrenceAnchorDate(schedule, timezone));
  const time = schedule.kind === "all_day" ? "All day" : formatAnchorTime(schedule, hourCycle);
  return `${cadence} · ${time} · ${timezone} · ${formatEnd(definition.end)}`;
}

export function recurrenceDraftWithPreset(
  draft: TaskRecurrenceDraft,
  presetKind: RecurrencePresetKind,
  schedule: TaskScheduleValue,
  timezone: string,
): TaskRecurrenceDraft {
  const anchorWeekday = Temporal.PlainDate.from(recurrenceAnchorDate(schedule, timezone))
    .dayOfWeek as RecurrenceWeekday;
  return {
    ...draft,
    presetKind,
    weekdays: presetKind === "weekly" ? [anchorWeekday] : draft.weekdays,
  };
}

export function toggleRecurrenceWeekday(
  weekdays: readonly RecurrenceWeekday[],
  weekday: RecurrenceWeekday,
): readonly RecurrenceWeekday[] {
  return weekdays.includes(weekday)
    ? weekdays.filter((value) => value !== weekday)
    : [...weekdays, weekday].sort((left, right) => left - right);
}

function recurrenceAnchorDate(schedule: TaskScheduleValue, timezone: string): string {
  return schedule.kind === "all_day"
    ? schedule.startDate
    : Temporal.Instant.from(schedule.startAt).toZonedDateTimeISO(timezone).toPlainDate().toString();
}

function formatCadence(preset: RecurrencePreset, anchorDate: string): string {
  if (preset.kind === "daily") return preset.interval === 1 ? "Every day" : `Every ${preset.interval} days`;
  if (preset.kind === "weekdays") {
    return preset.interval === 1 ? "Every weekday" : `Every ${preset.interval} weeks on weekdays`;
  }
  if (preset.kind === "weekly") {
    const days = preset.weekdays.map((weekday) => recurrenceWeekdayOptions[weekday - 1]!.longLabel);
    const interval = preset.interval === 1 ? "Every week" : `Every ${preset.interval} weeks`;
    return `${interval} on ${joinWords(days)}`;
  }
  const anchor = Temporal.PlainDate.from(anchorDate);
  if (preset.kind === "monthly") {
    const interval = preset.interval === 1 ? "Every month" : `Every ${preset.interval} months`;
    return `${interval} on day ${anchor.day}; missing dates are skipped`;
  }
  const interval = preset.interval === 1 ? "Every year" : `Every ${preset.interval} years`;
  return `${interval} on ${formatPlainDate(anchor)}; missing leap dates are skipped`;
}

function formatAnchorTime(
  schedule: Extract<TaskScheduleValue, { kind: "timed" }>,
  hourCycle: "h12" | "h23",
): string {
  return new Intl.DateTimeFormat("en", {
    timeZone: schedule.timezone,
    hour: "numeric",
    minute: "2-digit",
    hourCycle,
  }).format(new Date(schedule.startAt));
}

function formatEnd(end: RecurrenceDefinition["end"]): string {
  if (end.kind === "never") return "No end";
  if (end.kind === "count") {
    return `${end.count} occurrence${end.count === 1 ? "" : "s"}, including the anchor`;
  }
  return `Through ${formatPlainDate(Temporal.PlainDate.from(end.untilDate))}, inclusive`;
}

function formatPlainDate(date: Temporal.PlainDate): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(Date.UTC(date.year, date.month - 1, date.day)),
  );
}

function boundedInteger(value: string, minimum: number, maximum: number, message: string): number | string {
  if (!/^\d+$/.test(value)) return message;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : message;
}

function isCanonicalDate(value: string): boolean {
  try {
    return Temporal.PlainDate.from(value).toString() === value;
  } catch {
    return false;
  }
}

function joinWords(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}
