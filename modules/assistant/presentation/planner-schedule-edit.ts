import { Temporal } from "temporal-polyfill";

import type { PlannerSchedule } from "../application/contracts";

export function scheduleToLocalValue(instant: string, timeZone: string): string {
  try {
    return Temporal.Instant.from(instant)
      .toZonedDateTimeISO(timeZone)
      .toPlainDateTime()
      .toString({ smallestUnit: "minute" });
  } catch {
    return "";
  }
}

export function localValueToInstant(value: string, timeZone: string): string | null {
  try {
    return localDateTimeToInstant(Temporal.PlainDateTime.from(value), timeZone);
  } catch {
    return null;
  }
}

export function defaultTimedSchedule(input: {
  planningDate: string;
  timeZone: string;
  workWindowStart: string;
  durationMinutes: number;
}): PlannerSchedule | null {
  try {
    const start = Temporal.PlainDateTime.from(
      `${input.planningDate}T${input.workWindowStart}`,
    ).toZonedDateTime(input.timeZone, { disambiguation: "reject" });
    return {
      kind: "timed",
      startAt: start.toInstant().toString(),
      endAt: start.add({ minutes: input.durationMinutes }).toInstant().toString(),
      timeZone: input.timeZone,
    };
  } catch {
    return null;
  }
}

function localDateTimeToInstant(value: Temporal.PlainDateTime, timeZone: string): string {
  return value.toZonedDateTime(timeZone, { disambiguation: "reject" }).toInstant().toString();
}
