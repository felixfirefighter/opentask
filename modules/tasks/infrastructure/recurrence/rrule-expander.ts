import { RRule, type Options, type Weekday } from "rrule";
import { Temporal } from "temporal-polyfill";

import {
  assertNextRecurrenceCandidateRequest,
  assertRecurrenceExpansionRequest,
  type NextRecurrenceCandidateRequest,
  type RecurrenceExpansionRequest,
  type RecurrenceExpansionResult,
} from "../../domain/recurrence/recurrence-expansion";
import type { RecurrencePreset, RecurrenceRule } from "../../domain/recurrence/recurrence-policy";
import {
  recurrenceAnchorLocalStart,
  type LocalRecurrenceStart,
} from "../../domain/recurrence/recurrence-time-policy";

const weekdays = [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA, RRule.SU] as const;

export class RruleRecurrenceExpander {
  expand(request: RecurrenceExpansionRequest): RecurrenceExpansionResult {
    assertRecurrenceExpansionRequest(request);
    const recurrence = createRrule(request.rule, recurrenceAnchorLocalStart(request.anchor));
    const bounds = pseudoUtcBounds(request.range);
    const inclusiveEnd = new Date(bounds.endExclusive.getTime() - 1);
    const dates = recurrence.between(
      bounds.startInclusive,
      inclusiveEnd,
      true,
      (_candidate, resultLength) => resultLength <= request.candidateLimit,
    );
    const truncated = dates.length > request.candidateLimit;

    return {
      candidates: dates
        .slice(0, request.candidateLimit)
        .map((date) => localStartFromPseudoUtc(date, request.anchor.kind)),
      truncated,
    };
  }

  next(request: NextRecurrenceCandidateRequest): LocalRecurrenceStart | null {
    assertNextRecurrenceCandidateRequest(request);
    const recurrence = createRrule(request.rule, recurrenceAnchorLocalStart(request.anchor));
    const next = recurrence.after(pseudoUtcFromLocalStart(request.after), false);
    return next === null ? null : localStartFromPseudoUtc(next, request.anchor.kind);
  }
}

function createRrule(rule: RecurrenceRule, anchor: LocalRecurrenceStart): RRule {
  const options: Partial<Options> = {
    freq: frequencyFor(rule.preset),
    interval: rule.preset.interval,
    dtstart: pseudoUtcFromLocalStart(anchor),
  };

  if (rule.preset.kind === "weekdays") {
    options.wkst = RRule.MO;
    options.byweekday = [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR];
  } else if (rule.preset.kind === "weekly") {
    options.wkst = RRule.MO;
    options.byweekday = rule.preset.weekdays.map((weekday) => weekdays[weekday - 1] as Weekday);
  } else if (rule.preset.kind === "monthly") {
    options.bymonthday = localDateFor(anchor).day;
  } else if (rule.preset.kind === "yearly") {
    const date = localDateFor(anchor);
    options.bymonth = date.month;
    options.bymonthday = date.day;
  }

  if (rule.end.kind === "count") options.count = rule.end.count;
  if (rule.end.kind === "until") options.until = endOfPseudoUtcDate(rule.end.untilDate);
  return new RRule(options, true);
}

function frequencyFor(preset: RecurrencePreset): number {
  if (preset.kind === "daily") return RRule.DAILY;
  if (preset.kind === "weekdays" || preset.kind === "weekly") return RRule.WEEKLY;
  if (preset.kind === "monthly") return RRule.MONTHLY;
  return RRule.YEARLY;
}

function pseudoUtcBounds(range: RecurrenceExpansionRequest["range"]): Readonly<{
  startInclusive: Date;
  endExclusive: Date;
}> {
  if (range.kind === "all_day") {
    return {
      startInclusive: pseudoUtcFromDate(Temporal.PlainDate.from(range.rangeStartDate)),
      endExclusive: pseudoUtcFromDate(Temporal.PlainDate.from(range.rangeEndDate)),
    };
  }
  return {
    startInclusive: pseudoUtcFromDateTime(Temporal.PlainDateTime.from(range.rangeStartLocalDateTime)),
    endExclusive: pseudoUtcFromDateTime(Temporal.PlainDateTime.from(range.rangeEndLocalDateTime)),
  };
}

function pseudoUtcFromLocalStart(start: LocalRecurrenceStart): Date {
  return start.kind === "all_day"
    ? pseudoUtcFromDate(Temporal.PlainDate.from(start.startDate))
    : pseudoUtcFromDateTime(Temporal.PlainDateTime.from(start.startLocalDateTime));
}

function pseudoUtcFromDate(date: Temporal.PlainDate): Date {
  return createUtcDate(date.year, date.month, date.day, 0, 0);
}

function pseudoUtcFromDateTime(dateTime: Temporal.PlainDateTime): Date {
  return createUtcDate(
    dateTime.year,
    dateTime.month,
    dateTime.day,
    dateTime.hour,
    dateTime.minute,
    dateTime.second,
    dateTime.millisecond,
  );
}

function createUtcDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
  millisecond = 0,
): Date {
  const value = new Date(0);
  value.setUTCFullYear(year, month - 1, day);
  value.setUTCHours(hour, minute, second, millisecond);
  if (!Number.isFinite(value.getTime()))
    throw new RangeError("The recurrence date is outside provider bounds.");
  return value;
}

function endOfPseudoUtcDate(localDate: string): Date {
  const start = pseudoUtcFromDate(Temporal.PlainDate.from(localDate));
  return new Date(start.getTime() + 24 * 60 * 60 * 1_000 - 1);
}

function localStartFromPseudoUtc(date: Date, kind: LocalRecurrenceStart["kind"]): LocalRecurrenceStart {
  if (kind === "all_day") {
    return {
      kind: "all_day",
      startDate: Temporal.PlainDate.from(dateFields(date)).toString(),
    };
  }
  return {
    kind: "timed",
    startLocalDateTime: Temporal.PlainDateTime.from({
      ...dateFields(date),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
    }).toString({ smallestUnit: "minute" }),
  };
}

function localDateFor(start: LocalRecurrenceStart): Temporal.PlainDate {
  return start.kind === "all_day"
    ? Temporal.PlainDate.from(start.startDate)
    : Temporal.PlainDateTime.from(start.startLocalDateTime).toPlainDate();
}

function dateFields(date: Date): Readonly<{ year: number; month: number; day: number }> {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}
