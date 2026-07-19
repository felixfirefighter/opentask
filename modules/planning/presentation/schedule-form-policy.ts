import { Temporal } from "temporal-polyfill";

import type { PlanningSchedule } from "./planning-client-api";

export type ScheduleFormValues = Readonly<{
  allDay: boolean;
  startDate: string;
  endDate: string;
  startLocal: string;
  endLocal: string;
}>;

export function initialScheduleForm(schedule: PlanningSchedule | null, localDate: string, timeZone: string) {
  if (schedule?.kind === "all_day") {
    return formValues(
      true,
      schedule.startDate,
      schedule.endDate,
      `${schedule.startDate}T09:00`,
      `${schedule.startDate}T10:00`,
    );
  }
  if (schedule?.kind === "timed") {
    const startLocal = instantToLocal(schedule.startAt, timeZone);
    const endLocal = instantToLocal(schedule.endAt, timeZone);
    return formValues(
      false,
      startLocal.slice(0, 10),
      nextLocalDate(startLocal.slice(0, 10)),
      startLocal,
      endLocal,
    );
  }
  return formValues(true, localDate, nextLocalDate(localDate), `${localDate}T09:00`, `${localDate}T10:00`);
}

export function scheduleFromForm(values: ScheduleFormValues, timeZone: string): PlanningSchedule {
  if (values.allDay) {
    const start = Temporal.PlainDate.from(values.startDate);
    const end = Temporal.PlainDate.from(values.endDate);
    if (Temporal.PlainDate.compare(end, start) <= 0)
      throw new RangeError("End date must be after start date.");
    return { kind: "all_day", startDate: start.toString(), endDate: end.toString() };
  }
  const start = Temporal.PlainDateTime.from(values.startLocal).toZonedDateTime(timeZone).toInstant();
  const end = Temporal.PlainDateTime.from(values.endLocal).toZonedDateTime(timeZone).toInstant();
  if (Temporal.Instant.compare(end, start) < 0) throw new RangeError("End time cannot be before start time.");
  return { kind: "timed", startAt: start.toString(), endAt: end.toString(), timezone: timeZone };
}

export function nextLocalDate(date: string) {
  return Temporal.PlainDate.from(date).add({ days: 1 }).toString();
}

export function localDateForInstant(instant: string, timeZone: string) {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(timeZone).toPlainDate().toString();
}

export function midpointLocalDate(startDate: string, endDate: string) {
  const start = Temporal.PlainDate.from(startDate);
  const days = start.until(Temporal.PlainDate.from(endDate)).days;
  return start.add({ days: Math.max(0, Math.floor(days / 2)) }).toString();
}

function instantToLocal(instant: string, timeZone: string) {
  return Temporal.Instant.from(instant)
    .toZonedDateTimeISO(timeZone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}

function formValues(
  allDay: boolean,
  startDate: string,
  endDate: string,
  startLocal: string,
  endLocal: string,
): ScheduleFormValues {
  return { allDay, startDate, endDate, startLocal, endLocal };
}
