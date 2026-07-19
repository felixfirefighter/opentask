import { Temporal } from "temporal-polyfill";

import type { InstantInterval, RawWorkWindow } from "./scheduler-model";

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const NANOSECONDS_PER_MINUTE = 60_000_000_000n;

export function minutesToNanoseconds(minutes: number): bigint | null {
  if (!Number.isSafeInteger(minutes) || minutes < 0) {
    return null;
  }

  return BigInt(minutes) * NANOSECONDS_PER_MINUTE;
}

export function parseInstant(value: string): bigint | null {
  try {
    return Temporal.Instant.from(value).epochNanoseconds;
  } catch {
    return null;
  }
}

export function parseInstantInterval(startAt: string, endAt: string): InstantInterval | null {
  const start = parseInstant(startAt);
  const end = parseInstant(endAt);

  if (start === null || end === null || end <= start) {
    return null;
  }

  return { start, end };
}

export function parseWorkWindow(timeZone: string, window: RawWorkWindow): InstantInterval | null {
  if (
    !LOCAL_DATE_PATTERN.test(window.localDate) ||
    !LOCAL_TIME_PATTERN.test(window.startTime) ||
    !LOCAL_TIME_PATTERN.test(window.endTime)
  ) {
    return null;
  }

  try {
    const date = Temporal.PlainDate.from(window.localDate, { overflow: "reject" });
    const startTime = Temporal.PlainTime.from(window.startTime, { overflow: "reject" });
    const endTime = Temporal.PlainTime.from(window.endTime, { overflow: "reject" });
    const start = date
      .toPlainDateTime(startTime)
      .toZonedDateTime(timeZone, { disambiguation: "reject" }).epochNanoseconds;
    const end = date
      .toPlainDateTime(endTime)
      .toZonedDateTime(timeZone, { disambiguation: "reject" }).epochNanoseconds;

    if (end <= start) {
      return null;
    }

    return { start, end };
  } catch {
    return null;
  }
}

export function formatInstant(value: bigint): string {
  return Temporal.Instant.fromEpochNanoseconds(value).toString();
}
