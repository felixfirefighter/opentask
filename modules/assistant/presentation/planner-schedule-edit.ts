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
    return Temporal.PlainDateTime.from(value).toZonedDateTime(timeZone).toInstant().toString();
  } catch {
    return null;
  }
}

export function defaultTimedSchedule(input: {
  planningDate: string;
  timeZone: string;
  workWindowStart: string;
  durationMinutes: number;
}): PlannerSchedule {
  const start = Temporal.PlainDateTime.from(`${input.planningDate}T${input.workWindowStart}`).toZonedDateTime(
    input.timeZone,
  );
  return {
    kind: "timed",
    startAt: start.toInstant().toString(),
    endAt: start.add({ minutes: input.durationMinutes }).toInstant().toString(),
    timeZone: input.timeZone,
  };
}

export function defaultAllDaySchedule(planningDate: string): PlannerSchedule {
  return {
    kind: "all_day",
    startDate: planningDate,
    endDate: Temporal.PlainDate.from(planningDate).add({ days: 1 }).toString(),
  };
}
