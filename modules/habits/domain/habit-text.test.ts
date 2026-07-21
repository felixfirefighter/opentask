import { describe, expect, it } from "vitest";

import {
  HABIT_COLOR_TOKENS,
  HABIT_ICON_MAX_CODE_POINTS,
  HABIT_NOTE_MAX_CODE_POINTS,
  HABIT_TITLE_MAX_CODE_POINTS,
  HABIT_UNIT_MAX_CODE_POINTS,
  assertHabitColorToken,
  isHabitColorToken,
} from "./habit-limits";
import {
  normalizeHabitIcon,
  normalizeHabitNote,
  normalizeHabitTitle,
  normalizeHabitUnit,
} from "./habit-text";

describe("habit authored text", () => {
  it("NFC-normalizes and trims required title, icon, and unit values", () => {
    expect(normalizeHabitTitle("  Cafe\u0301 walk  ")).toBe("Café walk");
    expect(normalizeHabitIcon("  ⭐  ")).toBe("⭐");
    expect(normalizeHabitUnit("  glass\u0065\u0301s  ")).toBe("glassés");
  });

  it("counts Unicode code points at every required-text bound", () => {
    expect(normalizeHabitTitle("😀".repeat(HABIT_TITLE_MAX_CODE_POINTS))).toHaveLength(
      HABIT_TITLE_MAX_CODE_POINTS * 2,
    );
    expect(normalizeHabitIcon("🟢".repeat(HABIT_ICON_MAX_CODE_POINTS))).toHaveLength(
      HABIT_ICON_MAX_CODE_POINTS * 2,
    );
    expect(normalizeHabitUnit("杯".repeat(HABIT_UNIT_MAX_CODE_POINTS))).toHaveLength(
      HABIT_UNIT_MAX_CODE_POINTS,
    );
    expect(() => normalizeHabitTitle("😀".repeat(HABIT_TITLE_MAX_CODE_POINTS + 1))).toThrowError(
      expect.objectContaining({ field: "title", reason: "TOO_LONG" }),
    );
    expect(() => normalizeHabitIcon("🟢".repeat(HABIT_ICON_MAX_CODE_POINTS + 1))).toThrowError(
      expect.objectContaining({ field: "icon", reason: "TOO_LONG" }),
    );
    expect(() => normalizeHabitUnit("杯".repeat(HABIT_UNIT_MAX_CODE_POINTS + 1))).toThrowError(
      expect.objectContaining({ field: "unit", reason: "TOO_LONG" }),
    );
  });

  it("preserves note whitespace, permits blank notes, and enforces the note bound", () => {
    expect(normalizeHabitNote("  Cafe\u0301\n")).toBe("  Café\n");
    expect(normalizeHabitNote(" \n ")).toBe(" \n ");
    expect(normalizeHabitNote("n".repeat(HABIT_NOTE_MAX_CODE_POINTS))).toHaveLength(
      HABIT_NOTE_MAX_CODE_POINTS,
    );
    expect(() => normalizeHabitNote("n".repeat(HABIT_NOTE_MAX_CODE_POINTS + 1))).toThrowError(
      expect.objectContaining({ field: "note", reason: "TOO_LONG" }),
    );
  });

  it.each([normalizeHabitTitle, normalizeHabitIcon, normalizeHabitUnit])(
    "rejects blank required text",
    (normalize) => {
      expect(() => normalize(" \n\t ")).toThrowError(expect.objectContaining({ reason: "BLANK" }));
    },
  );

  it.each(["\ud800", "\udc00", "contains\0null"])(
    "rejects text PostgreSQL cannot store losslessly",
    (unsafe) => {
      for (const normalize of [
        normalizeHabitTitle,
        normalizeHabitIcon,
        normalizeHabitUnit,
        normalizeHabitNote,
      ]) {
        expect(() => normalize(unsafe)).toThrowError(expect.objectContaining({ reason: "UNSAFE" }));
      }
    },
  );

  it("accepts exactly the six approved semantic color tokens", () => {
    expect(HABIT_COLOR_TOKENS).toEqual(["coral", "amber", "mint", "sky", "violet", "slate"]);
    for (const token of HABIT_COLOR_TOKENS) {
      expect(isHabitColorToken(token)).toBe(true);
      expect(() => assertHabitColorToken(token)).not.toThrow();
    }
    expect(isHabitColorToken("red")).toBe(false);
    expect(() => assertHabitColorToken("red")).toThrow(RangeError);
  });
});
