import { describe, expect, it } from "vitest";

import {
  assertRecurrenceEligibility,
  assertRecurrenceScheduleAnchor,
  projectRecurrenceCandidate,
  recurrenceAnchorLocalStart,
  type RecurrenceScheduleAnchor,
} from "./recurrence-time-policy";

describe("recurrence schedule eligibility", () => {
  it("accepts all-day durations from one through 31 calendar days", () => {
    expect(() =>
      assertRecurrenceScheduleAnchor({
        kind: "all_day",
        startDate: "2026-07-20",
        endDate: "2026-07-21",
        timezone: "Asia/Singapore",
      }),
    ).not.toThrow();
    expect(() =>
      assertRecurrenceScheduleAnchor({
        kind: "all_day",
        startDate: "2026-07-20",
        endDate: "2026-08-20",
        timezone: "Asia/Singapore",
      }),
    ).not.toThrow();
  });

  it("rejects zero-day, 32-day, and invalid-zone all-day anchors", () => {
    for (const anchor of [
      { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-20", timezone: "UTC" },
      { kind: "all_day", startDate: "2026-07-20", endDate: "2026-08-21", timezone: "UTC" },
      { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-21", timezone: "Mars/Olympus" },
      { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-21", timezone: "+08:00" },
    ] as const) {
      expect(() => assertRecurrenceScheduleAnchor(anchor)).toThrow(RangeError);
    }
  });

  it("accepts zero through 31 exact elapsed days for whole-minute timed anchors", () => {
    expect(() =>
      assertRecurrenceScheduleAnchor({
        kind: "timed",
        startAt: "2026-07-20T01:00:00Z",
        endAt: "2026-07-20T01:00:00Z",
        timezone: "Asia/Singapore",
      }),
    ).not.toThrow();
    expect(() =>
      assertRecurrenceScheduleAnchor({
        kind: "timed",
        startAt: "2026-07-20T01:00:00Z",
        endAt: "2026-08-20T01:00:00Z",
        timezone: "Asia/Singapore",
      }),
    ).not.toThrow();
  });

  it("rejects non-minute, negative, overlong, and later-fold timed anchors", () => {
    const invalid: RecurrenceScheduleAnchor[] = [
      {
        kind: "timed",
        startAt: "2026-07-20T01:00:01Z",
        endAt: "2026-07-20T02:00:00Z",
        timezone: "UTC",
      },
      {
        kind: "timed",
        startAt: "2026-07-20T02:00:00Z",
        endAt: "2026-07-20T01:00:00Z",
        timezone: "UTC",
      },
      {
        kind: "timed",
        startAt: "2026-07-20T01:00:00Z",
        endAt: "2026-08-20T01:01:00Z",
        timezone: "UTC",
      },
      {
        kind: "timed",
        startAt: "2026-11-01T06:30:00Z",
        endAt: "2026-11-01T07:30:00Z",
        timezone: "America/New_York",
      },
    ];
    for (const anchor of invalid) expect(() => assertRecurrenceScheduleAnchor(anchor)).toThrow(RangeError);
  });

  it("requires occurrence one to match the weekday preset and until not to precede it", () => {
    const monday: RecurrenceScheduleAnchor = {
      kind: "all_day",
      startDate: "2026-07-20",
      endDate: "2026-07-21",
      timezone: "UTC",
    };
    expect(() =>
      assertRecurrenceEligibility(
        { preset: { kind: "weekly", interval: 1, weekdays: [2] }, end: { kind: "never" } },
        monday,
      ),
    ).toThrow(RangeError);
    expect(() =>
      assertRecurrenceEligibility(
        { preset: { kind: "daily", interval: 1 }, end: { kind: "until", untilDate: "2026-07-19" } },
        monday,
      ),
    ).toThrow(RangeError);
  });
});

describe("recurrence occurrence time projection", () => {
  it("preserves all-day calendar duration", () => {
    expect(
      projectRecurrenceCandidate(
        {
          kind: "all_day",
          startDate: "2026-01-30",
          endDate: "2026-02-02",
          timezone: "America/New_York",
        },
        { kind: "all_day", startDate: "2026-03-07" },
      ),
    ).toEqual({
      kind: "all_day",
      startDate: "2026-03-07",
      endDate: "2026-03-10",
      timezone: "America/New_York",
    });
  });

  it("moves a spring-gap wall time later and preserves exact elapsed duration", () => {
    const anchor: RecurrenceScheduleAnchor = {
      kind: "timed",
      startAt: "2026-03-01T07:30:00Z",
      endAt: "2026-03-01T08:30:00Z",
      timezone: "America/New_York",
    };
    expect(recurrenceAnchorLocalStart(anchor)).toEqual({
      kind: "timed",
      startLocalDateTime: "2026-03-01T02:30",
    });
    expect(
      projectRecurrenceCandidate(anchor, {
        kind: "timed",
        startLocalDateTime: "2026-03-08T02:30",
      }),
    ).toEqual({
      kind: "timed",
      startAt: "2026-03-08T07:30:00Z",
      endAt: "2026-03-08T08:30:00Z",
      timezone: "America/New_York",
    });
  });

  it("chooses the earlier instant during a fold", () => {
    const anchor: RecurrenceScheduleAnchor = {
      kind: "timed",
      startAt: "2026-10-25T05:30:00Z",
      endAt: "2026-10-25T06:30:00Z",
      timezone: "America/New_York",
    };
    expect(
      projectRecurrenceCandidate(anchor, {
        kind: "timed",
        startLocalDateTime: "2026-11-01T01:30",
      }),
    ).toEqual({
      kind: "timed",
      startAt: "2026-11-01T05:30:00Z",
      endAt: "2026-11-01T06:30:00Z",
      timezone: "America/New_York",
    });
  });

  it("rejects mismatched candidate kinds and second-level local starts", () => {
    const anchor: RecurrenceScheduleAnchor = {
      kind: "all_day",
      startDate: "2026-07-20",
      endDate: "2026-07-21",
      timezone: "UTC",
    };
    expect(() =>
      projectRecurrenceCandidate(anchor, { kind: "timed", startLocalDateTime: "2026-07-20T09:00" }),
    ).toThrow(RangeError);
  });
});
