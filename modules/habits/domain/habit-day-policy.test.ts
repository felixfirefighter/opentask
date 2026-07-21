import { describe, expect, it } from "vitest";

import type { HabitGoal } from "./habit-goal-policy";
import {
  assertHabitDayRecordable,
  classifyHabitDay,
  isSuccessfulHabitLog,
  normalizeHabitDayLog,
  normalizeHabitLogValue,
} from "./habit-day-policy";

const booleanGoal = { goalKind: "boolean", targetValue: null, unit: null } as const;
const quantityGoal = { goalKind: "quantity", targetValue: 2.5, unit: "litres" } as const;

describe("habit local-day log policy", () => {
  it("normalizes valid boolean and numeric writes", () => {
    expect(
      normalizeHabitDayLog(booleanGoal, {
        localDate: "2026-07-21",
        state: "completed",
        quantity: null,
        note: " Cafe\u0301 ",
      }),
    ).toEqual({
      localDate: "2026-07-21",
      state: "completed",
      quantity: null,
      note: " Café ",
    });
    expect(normalizeHabitLogValue(quantityGoal, { state: "completed", quantity: 2.5, note: null })).toEqual({
      state: "completed",
      quantity: 2.5,
      note: null,
    });
    expect(normalizeHabitLogValue(quantityGoal, { state: "skipped", quantity: null, note: "rest" })).toEqual({
      state: "skipped",
      quantity: null,
      note: "rest",
    });
  });

  it("enforces goal-aware log quantity shapes", () => {
    expect(() =>
      normalizeHabitLogValue(booleanGoal, { state: "completed", quantity: 1, note: null }),
    ).toThrow(RangeError);
    expect(() =>
      normalizeHabitLogValue(quantityGoal, { state: "completed", quantity: null, note: null }),
    ).toThrow(RangeError);
    expect(() => normalizeHabitLogValue(quantityGoal, { state: "skipped", quantity: 1, note: null })).toThrow(
      RangeError,
    );
    expect(() =>
      normalizeHabitLogValue(quantityGoal, { state: "unachieved", quantity: 0, note: null }),
    ).toThrow(RangeError);
  });

  it("derives success against the current editable goal", () => {
    expect(isSuccessfulHabitLog(quantityGoal, { state: "completed", quantity: 2.499 })).toBe(false);
    expect(isSuccessfulHabitLog(quantityGoal, { state: "completed", quantity: 2.5 })).toBe(true);
    expect(isSuccessfulHabitLog(quantityGoal, { state: "skipped", quantity: null })).toBe(false);

    expect(isSuccessfulHabitLog(booleanGoal, { state: "completed", quantity: 1 })).toBe(true);
    expect(
      isSuccessfulHabitLog(
        { goalKind: "quantity", targetValue: 1, unit: "page" },
        { state: "completed", quantity: null },
      ),
    ).toBe(false);
  });

  it("classifies partial progress separately from explicit failures", () => {
    expect(
      classifyHabitDay(quantityGoal, {
        localDate: "2026-07-21",
        state: "completed",
        quantity: 1,
      }),
    ).toBe("partial");
    expect(
      classifyHabitDay(quantityGoal, {
        localDate: "2026-07-21",
        state: "completed",
        quantity: 3,
      }),
    ).toBe("successful");
    expect(
      classifyHabitDay(quantityGoal, {
        localDate: "2026-07-21",
        state: "unachieved",
        quantity: null,
      }),
    ).toBe("unachieved");
  });

  it("permits only scheduled, non-future local days for a new record", () => {
    const schedule = {
      kind: "weekdays",
      weekdays: [1, 3, 5],
      targetPerWeek: null,
      timezone: "Asia/Singapore",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    } as const;
    expect(() => assertHabitDayRecordable(schedule, "2026-07-20", "2026-07-20")).not.toThrow();
    expect(() => assertHabitDayRecordable(schedule, "2026-07-19", "2026-07-20")).toThrow(RangeError);
    expect(() => assertHabitDayRecordable(schedule, "2026-07-22", "2026-07-20")).toThrow(RangeError);
  });

  it("rejects invalid effective goal discriminants at the domain boundary", () => {
    expect(() =>
      isSuccessfulHabitLog({ goalKind: "unknown", targetValue: null, unit: null } as unknown as HabitGoal, {
        state: "completed",
        quantity: null,
      }),
    ).toThrow(RangeError);
  });
});
