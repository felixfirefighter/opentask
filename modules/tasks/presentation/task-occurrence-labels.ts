import type { TaskOccurrenceDto } from "../application/contracts";
import { classifyTaskWriteOutcome } from "./task-write-outcome";

export function occurrenceErrorMessage(
  outcome: ReturnType<typeof classifyTaskWriteOutcome> | null,
  latestUnavailable: boolean,
) {
  if (outcome === "conflict") {
    return latestUnavailable
      ? "This occurrence changed elsewhere, but the latest saved state could not be loaded."
      : "This occurrence changed elsewhere. The latest saved state is shown; review it before trying again.";
  }
  if (outcome === "unconfirmed") {
    return latestUnavailable
      ? "The occurrence-change outcome could not be confirmed, and the latest saved state could not be loaded."
      : "The occurrence-change outcome could not be confirmed. Retry the exact change or continue with the latest saved state.";
  }
  return "That occurrence change was not saved. The latest saved state remains available.";
}

export function occurrenceStateLabel(state: TaskOccurrenceDto["occurrenceState"]) {
  if (state === "completed") return "Completed";
  if (state === "skipped") return "Skipped";
  return "Open";
}

export function formatOccurrenceSchedule(schedule: TaskOccurrenceDto["schedule"], hourCycle: "h12" | "h23") {
  if (schedule.kind === "all_day") {
    const start = formatDate(schedule.startDate);
    const end = new Date(`${schedule.endDate}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() - 1);
    const endLabel = formatDate(end.toISOString().slice(0, 10));
    return start === endLabel ? `${start} · All day` : `${start}–${endLabel} · All day`;
  }
  const date = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: schedule.timezone,
  });
  const time = new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    hourCycle,
    timeZone: schedule.timezone,
  });
  const start = new Date(schedule.startAt);
  const end = new Date(schedule.endAt);
  const startDate = date.format(start);
  const endDate = date.format(end);
  const endLabel =
    localDateKey(start, schedule.timezone) === localDateKey(end, schedule.timezone)
      ? time.format(end)
      : `${endDate} · ${time.format(end)}`;
  return `${startDate} · ${time.format(start)}–${endLabel} · ${schedule.timezone}`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
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
