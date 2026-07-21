import { describe, expect, it } from "vitest";

import type { TaskScheduleValue } from "../application/contracts";
import type { TaskRecurrenceDto } from "../application/contracts/recurrence-contract";
import {
  createTaskRecurrenceDraft,
  formatRecurrenceSummary,
  interpretTaskRecurrenceDraft,
  recurrenceDraftWithPreset,
  toggleRecurrenceWeekday,
  type TaskRecurrenceDraft,
} from "./task-recurrence-form-policy";

describe("task recurrence form policy", () => {
  it("starts a new weekly draft on the schedule anchor weekday", () => {
    const daily = createTaskRecurrenceDraft(null, allDaySchedule(), "Asia/Singapore");
    const weekly = recurrenceDraftWithPreset(daily, "weekly", allDaySchedule(), "Asia/Singapore");

    expect(daily).toMatchObject({
      presetKind: "daily",
      interval: "1",
      endKind: "never",
    });
    expect(weekly.weekdays).toEqual([1]);
  });

  it("parses sorted selected weekdays and a bounded occurrence count", () => {
    const result = interpretTaskRecurrenceDraft(
      {
        ...baseDraft(),
        presetKind: "weekly",
        weekdays: [5, 1, 3],
        endKind: "count",
        count: "999",
      },
      allDaySchedule(),
      "Asia/Singapore",
      "h23",
    );

    expect(result).toMatchObject({
      valid: true,
      definition: {
        preset: { kind: "weekly", interval: 1, weekdays: [1, 3, 5] },
        end: { kind: "count", count: 999 },
      },
    });
  });

  it.each([
    ["0", "Interval must be a whole number from 1 to 99."],
    ["100", "Interval must be a whole number from 1 to 99."],
    ["1.5", "Interval must be a whole number from 1 to 99."],
  ])("rejects invalid interval %s without changing the draft", (interval, message) => {
    const draft = { ...baseDraft(), interval };
    const result = interpretTaskRecurrenceDraft(draft, allDaySchedule(), "Asia/Singapore", "h23");

    expect(result).toEqual({ valid: false, message });
    expect(draft.interval).toBe(interval);
  });

  it("rejects an empty weekly selection and an anchor weekday mismatch", () => {
    const empty = interpretTaskRecurrenceDraft(
      { ...baseDraft(), presetKind: "weekly", weekdays: [] },
      allDaySchedule(),
      "Asia/Singapore",
      "h23",
    );
    const mismatch = interpretTaskRecurrenceDraft(
      { ...baseDraft(), presetKind: "weekly", weekdays: [2] },
      allDaySchedule(),
      "Asia/Singapore",
      "h23",
    );

    expect(empty).toEqual({ valid: false, message: "Choose at least one weekday." });
    expect(mismatch).toMatchObject({ valid: false });
  });

  it("validates inclusive end dates and count bounds", () => {
    const invalidDate = interpretTaskRecurrenceDraft(
      { ...baseDraft(), endKind: "until", untilDate: "2026-02-30" },
      allDaySchedule(),
      "Asia/Singapore",
      "h23",
    );
    const invalidCount = interpretTaskRecurrenceDraft(
      { ...baseDraft(), endKind: "count", count: "1000" },
      allDaySchedule(),
      "Asia/Singapore",
      "h23",
    );

    expect(invalidDate).toEqual({ valid: false, message: "Choose a valid inclusive end date." });
    expect(invalidCount).toEqual({
      valid: false,
      message: "Occurrence count must be a whole number from 1 to 999.",
    });
  });

  it("explains month-end, leap-day, timezone, time, and inclusive ending semantics", () => {
    const monthly = formatRecurrenceSummary(
      { preset: { kind: "monthly", interval: 1 }, end: { kind: "until", untilDate: "2026-09-30" } },
      { kind: "all_day", startDate: "2026-07-31", endDate: "2026-08-01" },
      "Asia/Singapore",
      "h23",
    );
    const yearly = formatRecurrenceSummary(
      { preset: { kind: "yearly", interval: 1 }, end: { kind: "never" } },
      { kind: "all_day", startDate: "2028-02-29", endDate: "2028-03-01" },
      "UTC",
      "h23",
    );
    const timed = formatRecurrenceSummary(
      { preset: { kind: "daily", interval: 2 }, end: { kind: "count", count: 3 } },
      timedSchedule(),
      "Asia/Singapore",
      "h23",
    );

    expect(monthly).toContain("day 31; missing dates are skipped");
    expect(monthly).toContain("inclusive");
    expect(yearly).toContain("Feb 29, 2028; missing leap dates are skipped");
    expect(timed).toContain("09:00");
    expect(timed).toContain("Asia/Singapore");
    expect(timed).toContain("3 occurrences, including the anchor");
  });

  it.each([
    [
      "a non-minute schedule",
      {
        kind: "timed" as const,
        startAt: "2026-07-20T01:00:30Z",
        endAt: "2026-07-20T02:00:30Z",
        timezone: "Asia/Singapore",
      },
    ],
    [
      "an overlong all-day schedule",
      { kind: "all_day" as const, startDate: "2026-07-20", endDate: "2026-08-21" },
    ],
    [
      "a later-fold timed anchor",
      {
        kind: "timed" as const,
        startAt: "2026-11-01T06:30:00Z",
        endAt: "2026-11-01T07:30:00Z",
        timezone: "America/New_York",
      },
    ],
  ])("keeps the form draft intact when %s is ineligible", (_label, schedule) => {
    const draft = baseDraft();
    const result = interpretTaskRecurrenceDraft(
      draft,
      schedule,
      schedule.kind === "timed" ? schedule.timezone : "UTC",
      "h23",
    );

    expect(result).toMatchObject({ valid: false });
    expect(draft).toEqual(baseDraft());
  });

  it("toggles weekdays deterministically without duplicates", () => {
    expect(toggleRecurrenceWeekday([1, 5], 3)).toEqual([1, 3, 5]);
    expect(toggleRecurrenceWeekday([1, 3, 5], 3)).toEqual([1, 5]);
  });

  it("hydrates an ended definition without discarding its values", () => {
    expect(createTaskRecurrenceDraft(recurrence(), allDaySchedule(), "UTC")).toEqual({
      presetKind: "weekly",
      interval: "2",
      weekdays: [1, 3],
      endKind: "until",
      untilDate: "2026-08-31",
      count: "10",
    });
  });
});

function baseDraft(): TaskRecurrenceDraft {
  return {
    presetKind: "daily",
    interval: "1",
    weekdays: [1],
    endKind: "never",
    untilDate: "2026-08-31",
    count: "10",
  };
}

function allDaySchedule(): TaskScheduleValue {
  return { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-21" };
}

function timedSchedule(): TaskScheduleValue {
  return {
    kind: "timed",
    startAt: "2026-07-20T01:00:00Z",
    endAt: "2026-07-20T02:00:00Z",
    timezone: "Asia/Singapore",
  };
}

function recurrence(): TaskRecurrenceDto {
  return {
    taskId: "00000000-0000-4000-8000-000000000010",
    taskVersion: 3,
    generationMode: "schedule",
    timezone: "Asia/Singapore",
    definition: {
      preset: { kind: "weekly", interval: 2, weekdays: [1, 3] },
      end: { kind: "until", untilDate: "2026-08-31" },
    },
    cutover: {
      kind: "all_day",
      projectionStartDate: "2026-07-20",
      projectionEndDate: "2026-09-01",
    },
    lifecycle: "ended",
    createdAt: "2026-07-19T00:00:00Z",
    updatedAt: "2026-07-19T01:00:00Z",
  };
}
