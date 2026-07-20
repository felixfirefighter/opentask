import { Temporal } from "temporal-polyfill";

import {
  assertCanonicalLocalDate,
  type IsoWeekday,
  type RecurrencePreset,
  type RecurrenceRule,
} from "./recurrence-policy";
import {
  assertRecurrenceEligibility,
  canonicalMinuteLocalDateTime,
  recurrenceAnchorLocalStart,
  type LocalRecurrenceStart,
  type RecurrenceScheduleAnchor,
} from "./recurrence-time-policy";

const MONTHS_PER_GREGORIAN_CYCLE = 4_800;
const YEARS_PER_GREGORIAN_CYCLE = 400;
const WEEKDAY_PRESET = [1, 2, 3, 4, 5] as const satisfies readonly IsoWeekday[];

export function recurrenceIncludesCandidate(
  rule: RecurrenceRule,
  anchor: RecurrenceScheduleAnchor,
  candidate: LocalRecurrenceStart,
): boolean {
  assertRecurrenceEligibility(rule, anchor);
  const anchorStart = recurrenceAnchorLocalStart(anchor);
  if (anchorStart.kind !== candidate.kind) return false;

  const dates = recurrenceDates(anchorStart, candidate);
  if (dates === null || Temporal.PlainDate.compare(dates.candidate, dates.anchor) < 0) return false;
  if (rule.end.kind === "until" && Temporal.PlainDate.compare(dates.candidate, rule.end.untilDate) > 0) {
    return false;
  }

  const ordinal = candidateOrdinal(rule.preset, dates.anchor, dates.candidate);
  if (ordinal === null) return false;
  return rule.end.kind !== "count" || ordinal <= rule.end.count;
}

function recurrenceDates(
  anchor: LocalRecurrenceStart,
  candidate: LocalRecurrenceStart,
): Readonly<{ anchor: Temporal.PlainDate; candidate: Temporal.PlainDate }> | null {
  if (anchor.kind === "all_day" && candidate.kind === "all_day") {
    assertCanonicalLocalDate(candidate.startDate, "All-day recurrence candidate");
    return {
      anchor: Temporal.PlainDate.from(anchor.startDate),
      candidate: Temporal.PlainDate.from(candidate.startDate),
    };
  }
  if (anchor.kind !== "timed" || candidate.kind !== "timed") return null;

  const anchorDateTime = Temporal.PlainDateTime.from(anchor.startLocalDateTime);
  const candidateDateTime = Temporal.PlainDateTime.from(
    canonicalMinuteLocalDateTime(candidate.startLocalDateTime, "Timed recurrence candidate"),
  );
  if (!anchorDateTime.toPlainTime().equals(candidateDateTime.toPlainTime())) return null;
  return {
    anchor: anchorDateTime.toPlainDate(),
    candidate: candidateDateTime.toPlainDate(),
  };
}

function candidateOrdinal(
  preset: RecurrencePreset,
  anchor: Temporal.PlainDate,
  candidate: Temporal.PlainDate,
): number | null {
  if (preset.kind === "daily") return dailyOrdinal(anchor, candidate, preset.interval);
  if (preset.kind === "weekdays") {
    return weeklyOrdinal(anchor, candidate, preset.interval, WEEKDAY_PRESET);
  }
  if (preset.kind === "weekly") {
    return weeklyOrdinal(anchor, candidate, preset.interval, preset.weekdays);
  }
  if (preset.kind === "monthly") return monthlyOrdinal(anchor, candidate, preset.interval);
  return yearlyOrdinal(anchor, candidate, preset.interval);
}

function dailyOrdinal(
  anchor: Temporal.PlainDate,
  candidate: Temporal.PlainDate,
  interval: number,
): number | null {
  const days = anchor.until(candidate, { largestUnit: "days" }).days;
  return days >= 0 && days % interval === 0 ? days / interval + 1 : null;
}

function weeklyOrdinal(
  anchor: Temporal.PlainDate,
  candidate: Temporal.PlainDate,
  interval: number,
  weekdays: readonly IsoWeekday[],
): number | null {
  const days = anchor.until(candidate, { largestUnit: "days" }).days;
  if (days < 0 || !weekdays.includes(candidate.dayOfWeek as IsoWeekday)) return null;

  const weekIndex = Math.floor((days + anchor.dayOfWeek - 1) / 7);
  if (weekIndex % interval !== 0) return null;
  if (weekIndex === 0) {
    return countWeekdays(weekdays, anchor.dayOfWeek, candidate.dayOfWeek);
  }

  const qualifyingWeekIndex = weekIndex / interval;
  const firstWeekCount = weekdays.filter((weekday) => weekday >= anchor.dayOfWeek).length;
  const completedMiddleWeeks = Math.max(0, qualifyingWeekIndex - 1);
  const candidateWeekCount = weekdays.filter((weekday) => weekday <= candidate.dayOfWeek).length;
  return firstWeekCount + completedMiddleWeeks * weekdays.length + candidateWeekCount;
}

function countWeekdays(weekdays: readonly IsoWeekday[], start: number, end: number): number | null {
  if (end < start) return null;
  const count = weekdays.filter((weekday) => weekday >= start && weekday <= end).length;
  return count === 0 ? null : count;
}

function monthlyOrdinal(
  anchor: Temporal.PlainDate,
  candidate: Temporal.PlainDate,
  interval: number,
): number | null {
  if (candidate.day !== anchor.day) return null;
  const monthDifference = (candidate.year - anchor.year) * 12 + (candidate.month - anchor.month);
  if (monthDifference < 0 || monthDifference % interval !== 0) return null;
  return validCalendarPositionCount({
    firstUnit: anchor.year * 12 + anchor.month - 1,
    lastPosition: monthDifference / interval,
    interval,
    cycleUnits: MONTHS_PER_GREGORIAN_CYCLE,
    isValid: (absoluteMonth) => {
      const year = floorDivide(absoluteMonth, 12);
      const month = positiveModulo(absoluteMonth, 12) + 1;
      return anchor.day <= daysInMonth(year, month);
    },
  });
}

function yearlyOrdinal(
  anchor: Temporal.PlainDate,
  candidate: Temporal.PlainDate,
  interval: number,
): number | null {
  if (candidate.month !== anchor.month || candidate.day !== anchor.day) return null;
  const yearDifference = candidate.year - anchor.year;
  if (yearDifference < 0 || yearDifference % interval !== 0) return null;
  return validCalendarPositionCount({
    firstUnit: anchor.year,
    lastPosition: yearDifference / interval,
    interval,
    cycleUnits: YEARS_PER_GREGORIAN_CYCLE,
    isValid: (year) => anchor.day <= daysInMonth(year, anchor.month),
  });
}

function validCalendarPositionCount(
  input: Readonly<{
    firstUnit: number;
    lastPosition: number;
    interval: number;
    cycleUnits: number;
    isValid(unit: number): boolean;
  }>,
): number {
  const period = input.cycleUnits / greatestCommonDivisor(input.cycleUnits, input.interval);
  const positions = input.lastPosition + 1;
  const completePeriods = Math.floor(positions / period);
  const remainder = positions % period;
  let validPerPeriod = 0;
  let validRemainder = 0;

  for (let position = 0; position < period; position += 1) {
    if (!input.isValid(input.firstUnit + position * input.interval)) continue;
    validPerPeriod += 1;
    if (position < remainder) validRemainder += 1;
  }
  return completePeriods * validPerPeriod + validRemainder;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

function floorDivide(dividend: number, divisor: number): number {
  return Math.floor(dividend / divisor);
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
