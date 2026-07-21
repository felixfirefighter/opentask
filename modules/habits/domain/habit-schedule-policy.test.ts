import { describe, expect, it } from "vitest";

import type { HabitSchedule } from "./habit-schedule-policy";
import { isHabitScheduledOnDate, normalizeHabitSchedule } from "./habit-schedule-policy";

const bounds = {
  timezone: "America/New_York",
  startDate: "2026-07-01",
  endDate: "2026-07-31",
} as const;

describe("habit schedule policy", () => {
  it("accepts each exact schedule discriminant", () => {
    expect(normalizeHabitSchedule({ kind: "daily", weekdays: null, targetPerWeek: null, ...bounds })).toEqual(
      { kind: "daily", weekdays: null, targetPerWeek: null, ...bounds },
    );
    expect(
      normalizeHabitSchedule({
        kind: "weekdays",
        weekdays: [1, 3, 5],
        targetPerWeek: null,
        ...bounds,
      }),
    ).toEqual({ kind: "weekdays", weekdays: [1, 3, 5], targetPerWeek: null, ...bounds });
    expect(
      normalizeHabitSchedule({
        kind: "weekly_target",
        weekdays: null,
        targetPerWeek: 7,
        ...bounds,
      }),
    ).toEqual({ kind: "weekly_target", weekdays: null, targetPerWeek: 7, ...bounds });
  });

  it("treats start and end dates as inclusive", () => {
    const daily = { kind: "daily", weekdays: null, targetPerWeek: null, ...bounds } as const;
    expect(isHabitScheduledOnDate(daily, "2026-06-30")).toBe(false);
    expect(isHabitScheduledOnDate(daily, "2026-07-01")).toBe(true);
    expect(isHabitScheduledOnDate(daily, "2026-07-31")).toBe(true);
    expect(isHabitScheduledOnDate(daily, "2026-08-01")).toBe(false);
  });

  it("uses ISO weekdays and shows weekly targets on every in-range day", () => {
    const weekdays = {
      kind: "weekdays",
      weekdays: [1, 3, 5],
      targetPerWeek: null,
      ...bounds,
    } as const;
    expect(isHabitScheduledOnDate(weekdays, "2026-07-06")).toBe(true);
    expect(isHabitScheduledOnDate(weekdays, "2026-07-07")).toBe(false);
    expect(isHabitScheduledOnDate(weekdays, "2026-07-08")).toBe(true);

    const weekly = {
      kind: "weekly_target",
      weekdays: null,
      targetPerWeek: 3,
      ...bounds,
    } as const;
    for (const date of ["2026-07-06", "2026-07-07", "2026-07-11", "2026-07-12"]) {
      expect(isHabitScheduledOnDate(weekly, date)).toBe(true);
    }
  });

  it.each([
    { kind: "weekdays", weekdays: [], targetPerWeek: null },
    { kind: "weekdays", weekdays: [1, 1], targetPerWeek: null },
    { kind: "weekdays", weekdays: [3, 1], targetPerWeek: null },
    { kind: "weekdays", weekdays: [0], targetPerWeek: null },
    { kind: "weekdays", weekdays: [8], targetPerWeek: null },
    { kind: "weekly_target", weekdays: null, targetPerWeek: 0 },
    { kind: "weekly_target", weekdays: null, targetPerWeek: 8 },
    { kind: "weekly_target", weekdays: null, targetPerWeek: 2.5 },
  ])("rejects invalid cadence fields %#", (cadence) => {
    expect(() => normalizeHabitSchedule({ ...cadence, ...bounds } as unknown as HabitSchedule)).toThrow(
      RangeError,
    );
  });

  it("rejects mixed discriminant fields, invalid zones, and reversed ranges", () => {
    expect(() =>
      normalizeHabitSchedule({
        kind: "daily",
        weekdays: [1],
        targetPerWeek: null,
        ...bounds,
      } as unknown as HabitSchedule),
    ).toThrow(RangeError);
    expect(() =>
      normalizeHabitSchedule({
        kind: "daily",
        weekdays: null,
        targetPerWeek: null,
        ...bounds,
        timezone: "US/Eastern",
      }),
    ).toThrow(RangeError);
    expect(() =>
      normalizeHabitSchedule({
        kind: "daily",
        weekdays: null,
        targetPerWeek: null,
        ...bounds,
        startDate: "2026-08-01",
      }),
    ).toThrow(RangeError);
  });
});
