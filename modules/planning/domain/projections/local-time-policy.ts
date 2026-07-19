import { Temporal } from "temporal-polyfill";

import type { ProjectionSchedule } from "./projection-model";

const NANOSECONDS_PER_DAY = 86_400_000_000_000n;

export type InstantRange = Readonly<{
  start: bigint;
  end: bigint;
}>;

export type LocalRange = Readonly<{
  startDate: string;
  endDate: string;
  startAt: string;
  endAt: string;
}>;

export function localDateForInstant(instantAt: string, timeZone: string): string {
  return Temporal.Instant.from(instantAt).toZonedDateTimeISO(timeZone).toPlainDate().toString();
}

export function addLocalDays(localDate: string, days: number): string {
  if (!Number.isSafeInteger(days)) {
    throw new RangeError("Local-day arithmetic requires a whole number of days.");
  }

  return Temporal.PlainDate.from(localDate).add({ days }).toString();
}

export function countLocalDays(startDate: string, endDate: string): number {
  return Temporal.PlainDate.from(startDate).until(Temporal.PlainDate.from(endDate)).days;
}

export function buildLocalRange(startDate: string, endDate: string, timeZone: string): LocalRange {
  const start = startOfLocalDay(startDate, timeZone);
  const end = startOfLocalDay(endDate, timeZone);

  if (end.epochNanoseconds <= start.epochNanoseconds) {
    throw new RangeError("A planning range must end after it starts.");
  }

  if (end.epochNanoseconds - start.epochNanoseconds > 63n * NANOSECONDS_PER_DAY) {
    throw new RangeError("A planning range instant span cannot exceed 63 days.");
  }

  return {
    startDate,
    endDate,
    startAt: start.toString(),
    endAt: end.toString(),
  };
}

export function dueBoundary(schedule: ProjectionSchedule, allDayTimeZone: string): bigint {
  if (schedule.kind === "timed") {
    const start = parseInstant(schedule.startAt);
    const end = parseInstant(schedule.endAt);
    if (end < start) {
      throw new RangeError("A timed schedule cannot end before it starts.");
    }
    return end;
  }

  const start = Temporal.PlainDate.from(schedule.startDate);
  const end = Temporal.PlainDate.from(schedule.endDate);
  if (Temporal.PlainDate.compare(end, start) <= 0) {
    throw new RangeError("An all-day schedule must end after it starts.");
  }
  return startOfLocalDay(schedule.endDate, allDayTimeZone).epochNanoseconds;
}

export function scheduleOverlapsLocalRange(schedule: ProjectionSchedule, range: LocalRange): boolean {
  if (schedule.kind === "all_day") {
    return (
      compareLocalDates(schedule.startDate, range.endDate) < 0 &&
      compareLocalDates(schedule.endDate, range.startDate) > 0
    );
  }

  return instantIntervalOverlaps(
    parseInstant(schedule.startAt),
    parseInstant(schedule.endAt),
    parseInstant(range.startAt),
    parseInstant(range.endAt),
  );
}

export function scheduleStartForOrdering(schedule: ProjectionSchedule): bigint | string {
  return schedule.kind === "all_day" ? schedule.startDate : parseInstant(schedule.startAt);
}

export function agendaGroupDate(
  schedule: ProjectionSchedule,
  rangeStartDate: string,
  viewerTimeZone: string,
): string {
  const scheduleStartDate =
    schedule.kind === "all_day" ? schedule.startDate : localDateForInstant(schedule.startAt, viewerTimeZone);
  return compareLocalDates(scheduleStartDate, rangeStartDate) < 0 ? rangeStartDate : scheduleStartDate;
}

export function compareLocalDates(left: string, right: string): number {
  return Temporal.PlainDate.compare(Temporal.PlainDate.from(left), Temporal.PlainDate.from(right));
}

export function compareInstants(left: string, right: string): number {
  return Temporal.Instant.compare(Temporal.Instant.from(left), Temporal.Instant.from(right));
}

export function instantEpochNanoseconds(instantAt: string): bigint {
  return parseInstant(instantAt);
}

export function formatInstant(epochNanoseconds: bigint): string {
  return Temporal.Instant.fromEpochNanoseconds(epochNanoseconds).toString();
}

function startOfLocalDay(localDate: string, timeZone: string): Temporal.ZonedDateTime {
  const date = Temporal.PlainDate.from(localDate, { overflow: "reject" });
  return date
    .toPlainDateTime(Temporal.PlainTime.from("00:00"))
    .toZonedDateTime(timeZone, { disambiguation: "compatible" });
}

function parseInstant(instantAt: string): bigint {
  return Temporal.Instant.from(instantAt).epochNanoseconds;
}

function instantIntervalOverlaps(start: bigint, end: bigint, rangeStart: bigint, rangeEnd: bigint): boolean {
  if (end < start) {
    throw new RangeError("A timed schedule cannot end before it starts.");
  }

  if (start === end) {
    return start >= rangeStart && start < rangeEnd;
  }

  return start < rangeEnd && end > rangeStart;
}
