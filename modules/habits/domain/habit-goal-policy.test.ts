import { describe, expect, it } from "vitest";

import type { HabitGoal } from "./habit-goal-policy";
import { normalizeHabitGoal, normalizeHabitQuantity, normalizeHabitTargetValue } from "./habit-goal-policy";
import { HABIT_DECIMAL_MAX, HABIT_DECIMAL_SCALE } from "./habit-limits";

describe("habit goal policy", () => {
  it("normalizes valid boolean and quantity goals", () => {
    expect(normalizeHabitGoal({ goalKind: "boolean", targetValue: null, unit: null })).toEqual({
      goalKind: "boolean",
      targetValue: null,
      unit: null,
    });
    expect(normalizeHabitGoal({ goalKind: "quantity", targetValue: 2.5, unit: "  litres  " })).toEqual({
      goalKind: "quantity",
      targetValue: 2.5,
      unit: "litres",
    });
  });

  it("supports editing between goal kinds without keeping mixed fields", () => {
    expect(normalizeHabitGoal({ goalKind: "quantity", targetValue: 1, unit: "page" }).goalKind).toBe(
      "quantity",
    );
    expect(normalizeHabitGoal({ goalKind: "boolean", targetValue: null, unit: null }).goalKind).toBe(
      "boolean",
    );
    expect(() =>
      normalizeHabitGoal({
        goalKind: "boolean",
        targetValue: 1,
        unit: "page",
      } as unknown as HabitGoal),
    ).toThrow(RangeError);
  });

  it("accepts the exact fixed-decimal target and quantity bounds", () => {
    expect(normalizeHabitTargetValue(0.001)).toBe(0.001);
    expect(normalizeHabitTargetValue(HABIT_DECIMAL_MAX)).toBe(HABIT_DECIMAL_MAX);
    expect(normalizeHabitQuantity(0)).toBe(0);
    expect(normalizeHabitQuantity(HABIT_DECIMAL_MAX)).toBe(HABIT_DECIMAL_MAX);
    expect(HABIT_DECIMAL_SCALE).toBe(3);
  });

  it.each([
    0,
    -0.001,
    0.0001,
    0.300_000_000_000_000_04,
    999_999_998.123_000_5,
    HABIT_DECIMAL_MAX + 0.001,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("rejects an invalid target value of %s", (value) => {
    expect(() => normalizeHabitTargetValue(value)).toThrow(RangeError);
  });

  it.each([
    -0.001,
    1.0001,
    0.300_000_000_000_000_04,
    999_999_998.123_000_5,
    HABIT_DECIMAL_MAX + 0.001,
    Number.NaN,
    Number.NEGATIVE_INFINITY,
  ])("rejects an invalid logged quantity of %s", (value) => {
    expect(() => normalizeHabitQuantity(value)).toThrow(RangeError);
  });

  it("accepts canonical fixed decimals despite scaled binary representation", () => {
    expect(normalizeHabitTargetValue(0.3)).toBe(0.3);
    expect(normalizeHabitQuantity(1.001)).toBe(1.001);
  });
});
