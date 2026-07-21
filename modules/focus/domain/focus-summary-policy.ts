import { Temporal } from "temporal-polyfill";

import { FOCUS_SUMMARY_DAYS } from "./focus-limits";
import type { FocusKind, FocusState } from "./focus-session-policy";
import { assertRecordedFocusSeconds } from "./focus-session-policy";

export type FocusSummarySource = Readonly<{
  kind: FocusKind;
  state: FocusState;
  endedAt: Date | null;
  accumulatedActiveSeconds: number;
}>;

export type FocusSummaryDay = Readonly<{
  localDate: string;
  totalSeconds: number;
}>;

export type FocusSummaryTotals = Readonly<{
  timezone: string;
  todayLocalDate: string;
  todaySeconds: number;
  sevenDaySeconds: number;
  days: readonly FocusSummaryDay[];
}>;

export type FocusSummaryWindow = Readonly<{
  timezone: string;
  todayLocalDate: string;
  localDates: readonly string[];
  startAt: Date;
  endAt: Date;
}>;

export type FocusDailyTotal = Readonly<{
  localDate: string;
  totalSeconds: number;
}>;

export function createFocusSummaryWindow(timezone: string, now: Date): FocusSummaryWindow {
  const today = localDateAt(timezone, now, "The authoritative focus time is invalid.");
  const firstDay = today.subtract({ days: FOCUS_SUMMARY_DAYS - 1 });
  const localDates = Array.from({ length: FOCUS_SUMMARY_DAYS }, (_, index) =>
    firstDay.add({ days: index }).toString(),
  );
  return {
    timezone,
    todayLocalDate: today.toString(),
    localDates,
    startAt: instantAtStartOfDay(firstDay, timezone),
    endAt: instantAtStartOfDay(today.add({ days: 1 }), timezone),
  };
}

export function deriveFocusSummary(
  sources: readonly FocusSummarySource[],
  timezone: string,
  now: Date,
): FocusSummaryTotals {
  const window = createFocusSummaryWindow(timezone, now);
  const totals = new Map(window.localDates.map((localDate) => [localDate, 0]));

  for (const source of sources) {
    if (source.kind !== "focus" || source.state !== "completed") continue;
    if (source.endedAt === null) {
      throw new RangeError("A completed focus session requires an end time.");
    }
    assertRecordedFocusSeconds(source.accumulatedActiveSeconds);
    const localDate = localDateAt(
      timezone,
      source.endedAt,
      "A focus session end time is invalid.",
    ).toString();
    const existing = totals.get(localDate);
    if (existing === undefined) continue;
    const next = existing + source.accumulatedActiveSeconds;
    if (!Number.isSafeInteger(next)) throw new RangeError("The focus summary exceeds the safe range.");
    totals.set(localDate, next);
  }

  return deriveFocusSummaryFromDailyTotals(
    Array.from(totals, ([localDate, totalSeconds]) => ({ localDate, totalSeconds })),
    window,
  );
}

export function deriveFocusSummaryFromDailyTotals(
  rows: readonly FocusDailyTotal[],
  window: FocusSummaryWindow,
): FocusSummaryTotals {
  const allowedDates = new Set(window.localDates);
  if (allowedDates.size !== FOCUS_SUMMARY_DAYS || !allowedDates.has(window.todayLocalDate)) {
    throw new RangeError("The focus summary window is invalid.");
  }
  const totals = new Map(window.localDates.map((localDate) => [localDate, 0]));
  const seenDates = new Set<string>();
  for (const row of rows) {
    if (!allowedDates.has(row.localDate)) {
      throw new RangeError("A focus daily total is outside its summary window.");
    }
    if (seenDates.has(row.localDate)) {
      throw new RangeError("Focus daily totals must contain at most one row per local date.");
    }
    if (!Number.isSafeInteger(row.totalSeconds) || row.totalSeconds < 0) {
      throw new RangeError("A focus daily total is invalid.");
    }
    seenDates.add(row.localDate);
    totals.set(row.localDate, row.totalSeconds);
  }

  const days = window.localDates.map((localDate) => ({
    localDate,
    totalSeconds: totals.get(localDate) ?? 0,
  }));
  const sevenDaySeconds = days.reduce((total, day) => {
    const next = total + day.totalSeconds;
    if (!Number.isSafeInteger(next)) throw new RangeError("The focus summary exceeds the safe range.");
    return next;
  }, 0);

  return {
    timezone: window.timezone,
    todayLocalDate: window.todayLocalDate,
    todaySeconds: totals.get(window.todayLocalDate) ?? 0,
    sevenDaySeconds,
    days,
  };
}

function instantAtStartOfDay(date: Temporal.PlainDate, timezone: string): Date {
  return new Date(date.toZonedDateTime({ timeZone: timezone, plainTime: "00:00" }).toInstant().toString());
}

function localDateAt(timezone: string, instant: Date, invalidMessage: string): Temporal.PlainDate {
  if (!Number.isFinite(instant.getTime())) throw new RangeError(invalidMessage);
  try {
    return Temporal.Instant.from(instant.toISOString()).toZonedDateTimeISO(timezone).toPlainDate();
  } catch {
    throw new RangeError("The saved focus timezone is invalid.");
  }
}
