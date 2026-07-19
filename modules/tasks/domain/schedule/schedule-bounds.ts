import { Temporal } from "temporal-polyfill";

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

export function addLocalDays(localDate: string, days: number): string {
  if (!Number.isSafeInteger(days)) throw new RangeError("Local-day arithmetic requires whole days.");
  return Temporal.PlainDate.from(localDate).add({ days }).toString();
}

export function compareLocalDates(left: string, right: string): number {
  return Temporal.PlainDate.compare(Temporal.PlainDate.from(left), Temporal.PlainDate.from(right));
}

export function compareInstants(left: string, right: string): number {
  return Temporal.Instant.compare(Temporal.Instant.from(left), Temporal.Instant.from(right));
}
