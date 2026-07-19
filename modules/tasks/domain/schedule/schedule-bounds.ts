import { Temporal } from "temporal-polyfill";

export const MAX_SCHEDULE_RANGE_DAYS = 62;
const MAX_SCHEDULE_RANGE_NANOSECONDS = 63n * 24n * 60n * 60n * 1_000_000_000n;

export function assertAllDayScheduleBounds(startDate: string, endDate: string): void {
  const start = Temporal.PlainDate.from(startDate);
  const end = Temporal.PlainDate.from(endDate);
  if (Temporal.PlainDate.compare(end, start) <= 0) {
    throw new RangeError("An all-day schedule must end after it starts.");
  }
}

export function assertTimedScheduleBounds(startAt: string, endAt: string): void {
  const start = Temporal.Instant.from(startAt);
  const end = Temporal.Instant.from(endAt);
  if (Temporal.Instant.compare(end, start) < 0) {
    throw new RangeError("A timed schedule cannot end before it starts.");
  }
}

export function assertScheduleQueryBounds(
  startDate: string,
  endDate: string,
  startAt: string,
  endAt: string,
): void {
  const localStart = Temporal.PlainDate.from(startDate);
  const localEnd = Temporal.PlainDate.from(endDate);
  assertAllDayScheduleBounds(startDate, endDate);
  if (localStart.until(localEnd).days > MAX_SCHEDULE_RANGE_DAYS) {
    throw new RangeError(`A schedule query cannot span more than ${MAX_SCHEDULE_RANGE_DAYS} local days.`);
  }

  const instantStart = Temporal.Instant.from(startAt);
  const instantEnd = Temporal.Instant.from(endAt);
  const elapsed = instantEnd.epochNanoseconds - instantStart.epochNanoseconds;
  if (elapsed <= 0n) {
    throw new RangeError("A schedule query must have a non-empty instant range.");
  }
  if (elapsed > MAX_SCHEDULE_RANGE_NANOSECONDS) {
    throw new RangeError("A schedule query instant range is too large.");
  }
}

export function addLocalDays(localDate: string, days: number): string {
  if (!Number.isSafeInteger(days)) throw new RangeError("Local-day arithmetic requires whole days.");
  return Temporal.PlainDate.from(localDate).add({ days }).toString();
}

export function compareLocalDates(left: string, right: string): number {
  return Temporal.PlainDate.compare(Temporal.PlainDate.from(left), Temporal.PlainDate.from(right));
}
