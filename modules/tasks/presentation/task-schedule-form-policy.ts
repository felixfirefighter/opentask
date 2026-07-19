import { Temporal } from "temporal-polyfill";

import { ianaTimeZoneSchema } from "@/shared/validation/time-zone";

import {
  taskScheduleValueSchema,
  type TaskScheduleDto,
  type TaskScheduleValue,
} from "../application/contracts";

export type TaskScheduleDraft = Readonly<{
  kind: "all_day" | "timed";
  startDate: string;
  endDate: string;
  startLocal: string;
  endLocal: string;
  timeZone: string;
}>;

export type ScheduleInterpretation =
  | Readonly<{ valid: true; schedule: TaskScheduleValue; summary: string }>
  | Readonly<{ valid: false; message: string }>;

export function createTaskScheduleDraft(
  schedule: TaskScheduleDto | null,
  preferredTimeZone: string,
  nowInstant = Temporal.Now.instant().toString(),
): TaskScheduleDraft {
  if (schedule?.kind === "timed") {
    const startLocal = instantToLocal(schedule.startAt, schedule.timezone);
    const endLocal = instantToLocal(schedule.endAt, schedule.timezone);
    const startDate = startLocal.slice(0, 10);
    return {
      kind: "timed",
      startDate,
      endDate: nextLocalDate(startDate),
      startLocal,
      endLocal,
      timeZone: schedule.timezone,
    };
  }

  const localDate =
    schedule?.kind === "all_day"
      ? schedule.startDate
      : Temporal.Instant.from(nowInstant).toZonedDateTimeISO(preferredTimeZone).toPlainDate().toString();
  return {
    kind: schedule?.kind ?? "all_day",
    startDate: schedule?.kind === "all_day" ? schedule.startDate : localDate,
    endDate: schedule?.kind === "all_day" ? schedule.endDate : nextLocalDate(localDate),
    startLocal: `${localDate}T09:00`,
    endLocal: `${localDate}T10:00`,
    timeZone: preferredTimeZone,
  };
}

export function interpretTaskScheduleDraft(
  draft: TaskScheduleDraft,
  hourCycle: "h12" | "h23",
): ScheduleInterpretation {
  try {
    const schedule = taskScheduleValueFromDraft(draft);
    return {
      valid: true,
      schedule,
      summary: formatTaskSchedule(schedule, draft.timeZone, hourCycle),
    };
  } catch (error) {
    return { valid: false, message: scheduleErrorMessage(error) };
  }
}

export function taskScheduleValueFromDraft(draft: TaskScheduleDraft): TaskScheduleValue {
  const timeZone = ianaTimeZoneSchema.parse(draft.timeZone);
  if (draft.kind === "all_day") {
    const start = Temporal.PlainDate.from(draft.startDate);
    const end = Temporal.PlainDate.from(draft.endDate);
    if (Temporal.PlainDate.compare(end, start) <= 0) {
      throw new RangeError("End date must be after start date.");
    }
    return taskScheduleValueSchema.parse({
      kind: "all_day",
      startDate: start.toString(),
      endDate: end.toString(),
    });
  }

  const start = localDateTimeToInstant(draft.startLocal, timeZone);
  const end = localDateTimeToInstant(draft.endLocal, timeZone);
  if (Temporal.Instant.compare(end, start) < 0) {
    throw new RangeError("End time cannot be before start time.");
  }
  return taskScheduleValueSchema.parse({
    kind: "timed",
    startAt: start.toString(),
    endAt: end.toString(),
    timezone: timeZone,
  });
}

export function formatTaskSchedule(
  schedule: TaskScheduleValue,
  allDayTimeZone: string,
  hourCycle: "h12" | "h23",
): string {
  if (schedule.kind === "all_day") {
    const start = Temporal.PlainDate.from(schedule.startDate);
    const inclusiveEnd = Temporal.PlainDate.from(schedule.endDate).subtract({ days: 1 });
    const range =
      Temporal.PlainDate.compare(start, inclusiveEnd) === 0
        ? formatPlainDate(start)
        : `${formatPlainDate(start)} to ${formatPlainDate(inclusiveEnd)}`;
    return `All day · ${range} · ends before ${formatPlainDate(Temporal.PlainDate.from(schedule.endDate))} in ${allDayTimeZone}`;
  }

  const formatter = new Intl.DateTimeFormat("en", {
    timeZone: schedule.timezone,
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle,
  });
  return `${formatter.format(new Date(schedule.startAt))} to ${formatter.format(new Date(schedule.endAt))} · ${schedule.timezone}`;
}

function localDateTimeToInstant(value: string, timeZone: string) {
  return Temporal.PlainDateTime.from(value)
    .toZonedDateTime(timeZone, { disambiguation: "reject" })
    .toInstant();
}

function instantToLocal(instant: string, timeZone: string): string {
  return Temporal.Instant.from(instant)
    .toZonedDateTimeISO(timeZone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}

function nextLocalDate(date: string): string {
  return Temporal.PlainDate.from(date).add({ days: 1 }).toString();
}

function formatPlainDate(date: Temporal.PlainDate): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[date.month - 1]} ${date.day}, ${date.year}`;
}

function scheduleErrorMessage(error: unknown): string {
  if (error instanceof RangeError && /End (date|time)/.test(error.message)) return error.message;
  return "Enter valid dates, times, and an IANA timezone. Daylight-saving gaps or repeated times must be adjusted.";
}
