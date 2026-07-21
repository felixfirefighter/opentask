import { describe, expect, it } from "vitest";

import {
  assertRecurrenceRule,
  recurrencePresetIncludesAnchor,
  type RecurrenceRule,
} from "./recurrence-policy";

describe("recurrence rule policy", () => {
  it("accepts the frozen interval and count boundaries", () => {
    expect(() =>
      assertRecurrenceRule({ preset: { kind: "daily", interval: 1 }, end: { kind: "count", count: 1 } }),
    ).not.toThrow();
    expect(() =>
      assertRecurrenceRule({ preset: { kind: "yearly", interval: 99 }, end: { kind: "count", count: 999 } }),
    ).not.toThrow();
  });

  it.each([
    { preset: { kind: "daily", interval: 0 }, end: { kind: "never" } },
    { preset: { kind: "daily", interval: 100 }, end: { kind: "never" } },
    { preset: { kind: "daily", interval: 1.5 }, end: { kind: "never" } },
    { preset: { kind: "daily", interval: 1 }, end: { kind: "count", count: 0 } },
    { preset: { kind: "daily", interval: 1 }, end: { kind: "count", count: 1_000 } },
    { preset: { kind: "daily", interval: 1 }, end: { kind: "until", untilDate: "2026-7-20" } },
  ] satisfies RecurrenceRule[])("rejects out-of-contract numeric/date input", (rule) => {
    expect(() => assertRecurrenceRule(rule)).toThrow(RangeError);
  });

  it.each([
    { weekdays: [] },
    { weekdays: [2, 1] },
    { weekdays: [1, 1] },
    { weekdays: [0] },
    { weekdays: [8] },
  ])("rejects a weekly weekday set that is not sorted, unique, and non-empty: %j", ({ weekdays }) => {
    const rule = {
      preset: { kind: "weekly", interval: 1, weekdays },
      end: { kind: "never" },
    } as RecurrenceRule;
    expect(() => assertRecurrenceRule(rule)).toThrow(RangeError);
  });

  it("checks that weekday presets contain occurrence one", () => {
    expect(recurrencePresetIncludesAnchor({ kind: "weekdays", interval: 1 }, "2026-07-20")).toBe(true);
    expect(recurrencePresetIncludesAnchor({ kind: "weekdays", interval: 1 }, "2026-07-19")).toBe(false);
    expect(
      recurrencePresetIncludesAnchor({ kind: "weekly", interval: 1, weekdays: [1, 3] }, "2026-07-22"),
    ).toBe(true);
    expect(
      recurrencePresetIncludesAnchor({ kind: "weekly", interval: 1, weekdays: [1, 3] }, "2026-07-23"),
    ).toBe(false);
  });
});
