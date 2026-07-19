import { Temporal } from "temporal-polyfill";

import type { PlanningSchedule } from "./planning-client-api";

export function editedQuickAddScheduleLabel(
  recognizedText: string,
  schedule: PlanningSchedule,
  hourCycle: "12" | "24",
) {
  if (schedule.kind === "all_day") {
    const start = Temporal.PlainDate.from(schedule.startDate);
    const inclusiveEnd = Temporal.PlainDate.from(schedule.endDate).subtract({ days: 1 });
    const range =
      Temporal.PlainDate.compare(start, inclusiveEnd) === 0
        ? formatDate(start)
        : `${formatDate(start)}–${formatDate(inclusiveEnd)}`;
    return `${recognizedText} · ${range}, all day`;
  }

  const date = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: schedule.timezone,
  });
  const time = new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: hourCycle === "12" ? "h12" : "h23",
    timeZone: schedule.timezone,
  });
  const start = new Date(schedule.startAt);
  const end = new Date(schedule.endAt);
  const startDate = date.format(start);
  const endDate = date.format(end);
  const range =
    startDate === endDate
      ? `${startDate}, ${time.format(start)}–${time.format(end)}`
      : `${startDate}, ${time.format(start)}–${endDate}, ${time.format(end)}`;
  return `${recognizedText} · ${range}`;
}

function formatDate(date: Temporal.PlainDate) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${date.toString()}T00:00:00.000Z`),
  );
}
