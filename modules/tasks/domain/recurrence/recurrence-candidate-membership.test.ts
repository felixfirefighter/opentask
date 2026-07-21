import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";

import { recurrenceIncludesCandidate } from "./recurrence-candidate-membership";
import type { RecurrenceRule } from "./recurrence-policy";
import type { LocalRecurrenceStart, RecurrenceScheduleAnchor } from "./recurrence-time-policy";

function allDayAnchor(startDate: string): RecurrenceScheduleAnchor {
  return {
    kind: "all_day",
    startDate,
    endDate: nextDate(startDate),
    timezone: "UTC",
  };
}

function includesAllDay(rule: RecurrenceRule, anchorDate: string, candidateDate: string): boolean {
  return recurrenceIncludesCandidate(rule, allDayAnchor(anchorDate), {
    kind: "all_day",
    startDate: candidateDate,
  });
}

describe("direct recurrence candidate membership", () => {
  it("evaluates daily interval, until, and count endings without enumeration", () => {
    expect(
      includesAllDay(
        { preset: { kind: "daily", interval: 2 }, end: { kind: "never" } },
        "2026-07-20",
        "2026-07-22",
      ),
    ).toBe(true);
    expect(
      includesAllDay(
        { preset: { kind: "daily", interval: 2 }, end: { kind: "until", untilDate: "2026-07-22" } },
        "2026-07-20",
        "2026-07-24",
      ),
    ).toBe(false);
    expect(
      includesAllDay(
        { preset: { kind: "daily", interval: 2 }, end: { kind: "count", count: 2 } },
        "2026-07-20",
        "2026-07-24",
      ),
    ).toBe(false);
  });

  it("counts selected weekdays from a midweek anchor across interval weeks", () => {
    const rule = {
      preset: { kind: "weekly", interval: 2, weekdays: [1, 3, 5] },
      end: { kind: "count", count: 5 },
    } as const satisfies RecurrenceRule;
    expect(includesAllDay(rule, "2026-07-22", "2026-07-22")).toBe(true);
    expect(includesAllDay(rule, "2026-07-22", "2026-07-24")).toBe(true);
    expect(includesAllDay(rule, "2026-07-22", "2026-08-03")).toBe(true);
    expect(includesAllDay(rule, "2026-07-22", "2026-08-05")).toBe(true);
    expect(includesAllDay(rule, "2026-07-22", "2026-08-07")).toBe(true);
    expect(includesAllDay(rule, "2026-07-22", "2026-08-17")).toBe(false);
    expect(includesAllDay(rule, "2026-07-22", "2026-07-29")).toBe(false);
  });

  it("matches weekday cadence and excludes weekends", () => {
    const rule = {
      preset: { kind: "weekdays", interval: 2 },
      end: { kind: "never" },
    } as const satisfies RecurrenceRule;
    expect(includesAllDay(rule, "2026-01-02", "2026-01-12")).toBe(true);
    expect(includesAllDay(rule, "2026-01-02", "2026-01-17")).toBe(false);
    expect(includesAllDay(rule, "2026-01-02", "2026-01-19")).toBe(false);
  });

  it("counts monthly missing days through a bounded Gregorian cycle", () => {
    const rule = {
      preset: { kind: "monthly", interval: 1 },
      end: { kind: "count", count: 4 },
    } as const satisfies RecurrenceRule;
    expect(includesAllDay(rule, "2026-01-31", "2026-07-31")).toBe(true);
    expect(includesAllDay(rule, "2026-01-31", "2026-08-31")).toBe(false);
    expect(includesAllDay(rule, "2026-01-31", "2026-04-30")).toBe(false);
  });

  it("preserves the maximum count and interval for distant yearly candidates", () => {
    const rule = {
      preset: { kind: "yearly", interval: 99 },
      end: { kind: "count", count: 999 },
    } as const satisfies RecurrenceRule;
    expect(includesAllDay(rule, "2024-01-01", "+100826-01-01")).toBe(true);
    expect(includesAllDay(rule, "2024-01-01", "+100925-01-01")).toBe(false);
  });

  it("skips non-leap yearly candidates without consuming count", () => {
    const rule = {
      preset: { kind: "yearly", interval: 1 },
      end: { kind: "count", count: 3 },
    } as const satisfies RecurrenceRule;
    expect(includesAllDay(rule, "2024-02-29", "2032-02-29")).toBe(true);
    expect(includesAllDay(rule, "2024-02-29", "2036-02-29")).toBe(false);
  });

  it("requires the anchor wall-clock time for timed candidates", () => {
    const anchor = {
      kind: "timed",
      startAt: "2026-03-07T07:30:00Z",
      endAt: "2026-03-07T08:30:00Z",
      timezone: "America/New_York",
    } as const satisfies RecurrenceScheduleAnchor;
    const rule = {
      preset: { kind: "daily", interval: 1 },
      end: { kind: "never" },
    } as const satisfies RecurrenceRule;

    expect(recurrenceIncludesCandidate(rule, anchor, timedCandidate("2026-03-08T02:30"))).toBe(true);
    expect(recurrenceIncludesCandidate(rule, anchor, timedCandidate("2026-03-08T03:30"))).toBe(false);
  });
});

function nextDate(value: string): string {
  return Temporal.PlainDate.from(value).add({ days: 1 }).toString();
}

function timedCandidate(startLocalDateTime: string): LocalRecurrenceStart {
  return { kind: "timed", startLocalDateTime };
}
