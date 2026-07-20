import type { CalendarEventDto, PlanningTaskRow } from "../application/public";

type HourCycle = "12" | "24";
type PlanningSchedule = PlanningTaskRow["schedule"];
type TimedSchedule = Extract<NonNullable<PlanningSchedule>, Readonly<{ kind: "timed" }>>;

export function formatPlanningScheduleLabel(
  schedule: PlanningSchedule,
  timeZone: string,
  hourCycle: HourCycle,
) {
  if (schedule === null) return "Unscheduled";
  if (schedule.kind === "all_day") {
    return `${formatLocalDate(schedule.startDate, { month: "short", day: "numeric" })} · Anytime`;
  }
  return formatTimeRange(schedule.startAt, schedule.endAt, timeZone, hourCycle);
}

export function formatDetailedOccurrenceScheduleLabel(
  schedule: PlanningSchedule,
  timeZone: string,
  hourCycle: HourCycle,
) {
  if (schedule === null) return "Unscheduled occurrence";
  if (schedule.kind === "all_day") {
    return `${formatAllDayRange(schedule.startDate, schedule.endDate)} · Anytime`;
  }
  return formatDetailedTimedRange(schedule, timeZone, hourCycle);
}

export function formatCalendarScheduleLabel(event: CalendarEventDto, timeZone: string, hourCycle: HourCycle) {
  if (event.kind === "all_day") {
    return `${formatAllDayRange(event.startDate, event.endDate)}, all day`;
  }
  return formatDetailedTimedRange(event, timeZone, hourCycle);
}

function formatAllDayRange(startDate: string, exclusiveEndDate: string) {
  const inclusiveEnd = new Date(`${exclusiveEndDate}T00:00:00.000Z`);
  inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() - 1);
  const inclusiveEndDate = inclusiveEnd.toISOString().slice(0, 10);
  const startLabel = formatLongLocalDate(startDate);
  return startDate === inclusiveEndDate
    ? startLabel
    : `${startLabel}–${formatLongLocalDate(inclusiveEndDate)}`;
}

function formatDetailedTimedRange(
  schedule: Pick<TimedSchedule, "startAt" | "endAt">,
  timeZone: string,
  hourCycle: HourCycle,
) {
  const start = new Date(schedule.startAt);
  const end = new Date(schedule.endAt);
  const startDate = formatZonedDate(start, timeZone);
  const endDate = formatZonedDate(end, timeZone);
  const startTime = formatZonedTime(start, timeZone, hourCycle);
  const endTime = formatZonedTime(end, timeZone, hourCycle);
  return localDateKey(start, timeZone) === localDateKey(end, timeZone)
    ? `${startDate}, ${startTime}–${endTime}`
    : `${startDate}, ${startTime}–${endDate}, ${endTime}`;
}

function formatTimeRange(startAt: string, endAt: string, timeZone: string, hourCycle: HourCycle) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  return `${formatZonedTime(start, timeZone, hourCycle)}–${formatZonedTime(end, timeZone, hourCycle)}`;
}

function formatLongLocalDate(date: string) {
  return formatLocalDate(date, { weekday: "long", month: "long", day: "numeric" });
}

function formatLocalDate(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en", { ...options, timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00.000Z`),
  );
}

function formatZonedDate(instant: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone,
  }).format(instant);
}

function formatZonedTime(instant: Date, timeZone: string, hourCycle: HourCycle) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: hourCycle === "12" ? "h12" : "h23",
    timeZone,
  }).format(instant);
}

function localDateKey(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
