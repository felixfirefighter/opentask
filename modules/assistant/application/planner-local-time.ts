import { Temporal } from "temporal-polyfill";

import type { PlannerInput } from "./contracts/planner-contract";

type PlannerWindowInput = Pick<PlannerInput, "planningDate" | "timeZone" | "workWindow">;

export type PlannerInstantRange = Readonly<{
  startAt: string;
  endAt: string;
  nextLocalDate: string;
}>;

export function resolvePlannerWorkWindow(input: PlannerWindowInput): PlannerInstantRange | null {
  try {
    return {
      startAt: localDateTimeToInstant(input.planningDate, input.workWindow.start, input.timeZone),
      endAt: localDateTimeToInstant(input.planningDate, input.workWindow.end, input.timeZone),
      nextLocalDate: Temporal.PlainDate.from(input.planningDate).add({ days: 1 }).toString(),
    };
  } catch {
    return null;
  }
}

export function optionalLocalDateTimeToInstant(
  value: Readonly<{ date: string; time: string }> | null,
  timeZone: string,
): string | undefined {
  if (value === null) return undefined;
  try {
    return localDateTimeToInstant(value.date, value.time, timeZone);
  } catch {
    // The scheduler owns invalid-constraint classification. A deliberately invalid
    // value keeps this provider suggestion out of a legal placement.
    return "invalid-local-date-time";
  }
}

function localDateTimeToInstant(date: string, time: string, timeZone: string): string {
  return Temporal.PlainDateTime.from(`${date}T${time}`)
    .toZonedDateTime(timeZone, { disambiguation: "reject" })
    .toInstant()
    .toString();
}
