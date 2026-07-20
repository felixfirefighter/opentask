import { describe, expect, it } from "vitest";

import type { RecurrenceRule } from "../../domain/recurrence/recurrence-policy";
import type { RecurrenceScheduleAnchor } from "../../domain/recurrence/recurrence-time-policy";
import { RruleRecurrenceExpander } from "./rrule-expander";

const expander = new RruleRecurrenceExpander();

function allDayAnchor(startDate: string): RecurrenceScheduleAnchor {
  const date = new Date(`${startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return {
    kind: "all_day",
    startDate,
    endDate: date.toISOString().slice(0, 10),
    timezone: "UTC",
  };
}

function expandAllDay(
  rule: RecurrenceRule,
  startDate: string,
  rangeStartDate: string,
  rangeEndDate: string,
  candidateLimit = 1_000,
) {
  return expander.expand({
    rule,
    anchor: allDayAnchor(startDate),
    range: { kind: "all_day", rangeStartDate, rangeEndDate },
    candidateLimit,
  });
}

describe("rrule recurrence expansion adapter", () => {
  it("expands daily intervals with the schedule anchor as occurrence one", () => {
    expect(
      expandAllDay(
        { preset: { kind: "daily", interval: 2 }, end: { kind: "count", count: 3 } },
        "2026-07-20",
        "2026-07-01",
        "2026-08-01",
      ),
    ).toEqual({
      candidates: [
        { kind: "all_day", startDate: "2026-07-20" },
        { kind: "all_day", startDate: "2026-07-22" },
        { kind: "all_day", startDate: "2026-07-24" },
      ],
      truncated: false,
    });
  });

  it("treats weekdays as Monday-Friday in every Nth ISO week", () => {
    const result = expandAllDay(
      { preset: { kind: "weekdays", interval: 2 }, end: { kind: "count", count: 7 } },
      "2026-01-02",
      "2026-01-01",
      "2026-01-20",
    );
    expect(result.candidates).toEqual([
      { kind: "all_day", startDate: "2026-01-02" },
      { kind: "all_day", startDate: "2026-01-12" },
      { kind: "all_day", startDate: "2026-01-13" },
      { kind: "all_day", startDate: "2026-01-14" },
      { kind: "all_day", startDate: "2026-01-15" },
      { kind: "all_day", startDate: "2026-01-16" },
    ]);
  });

  it("expands selected weekdays in ISO order", () => {
    expect(
      expandAllDay(
        { preset: { kind: "weekly", interval: 1, weekdays: [1, 3] }, end: { kind: "count", count: 4 } },
        "2026-01-07",
        "2026-01-01",
        "2026-01-20",
      ).candidates,
    ).toEqual([
      { kind: "all_day", startDate: "2026-01-07" },
      { kind: "all_day", startDate: "2026-01-12" },
      { kind: "all_day", startDate: "2026-01-14" },
      { kind: "all_day", startDate: "2026-01-19" },
    ]);
  });

  it("skips missing month days without consuming count", () => {
    expect(
      expandAllDay(
        { preset: { kind: "monthly", interval: 1 }, end: { kind: "count", count: 4 } },
        "2026-01-31",
        "2026-01-01",
        "2026-08-01",
      ).candidates,
    ).toEqual([
      { kind: "all_day", startDate: "2026-01-31" },
      { kind: "all_day", startDate: "2026-03-31" },
      { kind: "all_day", startDate: "2026-05-31" },
      { kind: "all_day", startDate: "2026-07-31" },
    ]);
  });

  it("skips non-leap years without consuming count", () => {
    expect(
      expandAllDay(
        { preset: { kind: "yearly", interval: 1 }, end: { kind: "count", count: 3 } },
        "2024-02-29",
        "2024-01-01",
        "2033-01-01",
      ).candidates,
    ).toEqual([
      { kind: "all_day", startDate: "2024-02-29" },
      { kind: "all_day", startDate: "2028-02-29" },
      { kind: "all_day", startDate: "2032-02-29" },
    ]);
  });

  it("applies until as an inclusive local date", () => {
    expect(
      expandAllDay(
        { preset: { kind: "daily", interval: 1 }, end: { kind: "until", untilDate: "2026-07-22" } },
        "2026-07-20",
        "2026-07-20",
        "2026-07-25",
      ).candidates,
    ).toEqual([
      { kind: "all_day", startDate: "2026-07-20" },
      { kind: "all_day", startDate: "2026-07-21" },
      { kind: "all_day", startDate: "2026-07-22" },
    ]);
  });

  it("returns no more than the requested cap and reports truncation", () => {
    const result = expandAllDay(
      { preset: { kind: "daily", interval: 1 }, end: { kind: "never" } },
      "2026-01-01",
      "2026-01-01",
      "2026-01-10",
      3,
    );
    expect(result).toEqual({
      candidates: [
        { kind: "all_day", startDate: "2026-01-01" },
        { kind: "all_day", startDate: "2026-01-02" },
        { kind: "all_day", startDate: "2026-01-03" },
      ],
      truncated: true,
    });
  });

  it("finds the next candidate strictly after a cursor and returns null when exhausted", () => {
    const request = {
      rule: { preset: { kind: "daily", interval: 2 }, end: { kind: "count", count: 2 } },
      anchor: allDayAnchor("2026-07-20"),
    } satisfies Pick<Parameters<RruleRecurrenceExpander["next"]>[0], "rule" | "anchor">;
    expect(expander.next({ ...request, after: { kind: "all_day", startDate: "2026-07-20" } })).toEqual({
      kind: "all_day",
      startDate: "2026-07-22",
    });
    expect(expander.next({ ...request, after: { kind: "all_day", startDate: "2026-07-22" } })).toBeNull();
  });

  it("enumerates timed wall-clock candidates without owning timezone disambiguation", () => {
    const result = expander.expand({
      rule: { preset: { kind: "daily", interval: 1 }, end: { kind: "count", count: 3 } },
      anchor: {
        kind: "timed",
        startAt: "2026-03-07T07:30:00Z",
        endAt: "2026-03-07T08:30:00Z",
        timezone: "America/New_York",
      },
      range: {
        kind: "timed",
        rangeStartLocalDateTime: "2026-03-07T00:00",
        rangeEndLocalDateTime: "2026-03-10T00:00",
      },
      candidateLimit: 10,
    });
    expect(result.candidates).toEqual([
      { kind: "timed", startLocalDateTime: "2026-03-07T02:30" },
      { kind: "timed", startLocalDateTime: "2026-03-08T02:30" },
      { kind: "timed", startLocalDateTime: "2026-03-09T02:30" },
    ]);
  });

  it("honors sub-minute local range boundaries while emitting whole-minute candidates", () => {
    const result = expander.expand({
      rule: { preset: { kind: "daily", interval: 1 }, end: { kind: "count", count: 2 } },
      anchor: {
        kind: "timed",
        startAt: "2026-07-20T01:30:00Z",
        endAt: "2026-07-20T02:30:00Z",
        timezone: "UTC",
      },
      range: {
        kind: "timed",
        rangeStartLocalDateTime: "2026-07-20T01:30:00.001",
        rangeEndLocalDateTime: "2026-07-22T01:30:00.000",
      },
      candidateLimit: 10,
    });
    expect(result.candidates).toEqual([{ kind: "timed", startLocalDateTime: "2026-07-21T01:30" }]);
  });
});
