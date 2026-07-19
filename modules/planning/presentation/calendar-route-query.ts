import { Temporal } from "temporal-polyfill";

import { planningRangeQuerySchema } from "../application/public";
import type { CalendarView } from "./planning-screen-model";

const views = new Set<CalendarView>(["month", "week", "day", "agenda"]);

export type CalendarRouteState = Readonly<{
  view: CalendarView;
  hasSavedView: boolean;
  initialDate: string;
  rangeStartDate: string;
  rangeEndDate: string;
}>;

export function readCalendarRouteState(
  params: Readonly<Record<string, string | string[] | undefined>>,
  localDate: string,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6,
): CalendarRouteState {
  const requestedView = single(params.view);
  const view =
    requestedView && views.has(requestedView as CalendarView) ? (requestedView as CalendarView) : "month";
  const initialDate = validDate(single(params.date)) ?? localDate;
  const explicitRange = planningRangeQuerySchema.safeParse({
    rangeStartDate: single(params.rangeStartDate),
    rangeEndDate: single(params.rangeEndDate),
    limit: 250,
  });
  const range = explicitRange.success ? explicitRange.data : defaultRange(initialDate, view, weekStartsOn);
  return {
    view,
    hasSavedView: requestedView !== null && requestedView === view,
    initialDate,
    rangeStartDate: range.rangeStartDate,
    rangeEndDate: range.rangeEndDate,
  };
}

function defaultRange(date: string, view: CalendarView, weekStartsOn: number) {
  const current = Temporal.PlainDate.from(date);
  if (view === "month") {
    const start = current.with({ day: 1 });
    return { rangeStartDate: start.toString(), rangeEndDate: start.add({ months: 1 }).toString() };
  }
  if (view === "day") {
    return { rangeStartDate: current.toString(), rangeEndDate: current.add({ days: 1 }).toString() };
  }
  const currentSundayIndex = current.dayOfWeek % 7;
  const daysSinceStart = (currentSundayIndex - weekStartsOn + 7) % 7;
  const start = current.subtract({ days: daysSinceStart });
  return { rangeStartDate: start.toString(), rangeEndDate: start.add({ days: 7 }).toString() };
}

function validDate(value: string | null) {
  if (!value) return null;
  try {
    return Temporal.PlainDate.from(value).toString() === value ? value : null;
  } catch {
    return null;
  }
}

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}
