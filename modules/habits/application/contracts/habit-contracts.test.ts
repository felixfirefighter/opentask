import { describe, expect, it } from "vitest";

import {
  createHabitRequestSchema,
  habitColorTokenSchema,
  habitHistoryQuerySchema,
  habitIconSchema,
  habitLogValueSchema,
  habitNoteSchema,
  habitQuantitySchema,
  habitScheduleValueSchema,
  habitTargetValueSchema,
  habitTodayBoundarySchema,
  habitTodayProjectionSchema,
  habitTitleSchema,
  habitUnitSchema,
} from "./index";

const dailySchedule = {
  kind: "daily",
  weekdays: null,
  targetPerWeek: null,
  timezone: "Asia/Singapore",
  startDate: "2026-07-01",
  endDate: null,
} as const;

describe("habit application contracts", () => {
  it("normalizes user text and enforces every frozen Unicode code-point bound", () => {
    expect(habitTitleSchema.parse("  Cafe\u0301 walk  ")).toBe("Café walk");
    expect(habitTitleSchema.parse("😀".repeat(200))).toHaveLength(400);
    expect(habitIconSchema.parse("🌿".repeat(16))).toHaveLength(32);
    expect(habitUnitSchema.parse("u".repeat(40))).toHaveLength(40);
    expect(habitNoteSchema.parse("n".repeat(1_000))).toHaveLength(1_000);

    expect(() => habitTitleSchema.parse("😀".repeat(201))).toThrow();
    expect(() => habitIconSchema.parse("🌿".repeat(17))).toThrow();
    expect(() => habitUnitSchema.parse("u".repeat(41))).toThrow();
    expect(() => habitNoteSchema.parse("n".repeat(1_001))).toThrow();

    for (const unsafe of ["\ud800", "\udc00", "contains\0null"]) {
      expect(() => habitTitleSchema.parse(unsafe)).toThrow();
      expect(() => habitNoteSchema.parse(unsafe)).toThrow();
    }
  });

  it("accepts only the approved colors and fixed three-decimal numeric bounds", () => {
    for (const token of ["coral", "amber", "mint", "sky", "violet", "slate"] as const) {
      expect(habitColorTokenSchema.parse(token)).toBe(token);
    }
    expect(() => habitColorTokenSchema.parse("red")).toThrow();

    expect(habitTargetValueSchema.parse(0.001)).toBe(0.001);
    expect(habitTargetValueSchema.parse(999_999_999.999)).toBe(999_999_999.999);
    expect(habitQuantitySchema.parse(0)).toBe(0);
    expect(habitQuantitySchema.parse(999_999_999.999)).toBe(999_999_999.999);
    for (const invalid of [0, -0.001, 0.0001, 999_999_998.123_000_5, 1_000_000_000]) {
      expect(() => habitTargetValueSchema.parse(invalid)).toThrow();
    }
    for (const invalid of [-0.001, 1.0001, 999_999_998.123_000_5, 1_000_000_000]) {
      expect(() => habitQuantitySchema.parse(invalid)).toThrow();
    }
  });

  it("keeps goal and log discriminants closed and goal-aware validation separate", () => {
    expect(
      createHabitRequestSchema.parse({
        title: "Walk",
        icon: "🌿",
        colorToken: "mint",
        goal: { goalKind: "boolean" },
        schedule: dailySchedule,
      }),
    ).toMatchObject({
      goal: { goalKind: "boolean", targetValue: null, unit: null },
    });

    for (const invalidGoal of [
      { goalKind: "boolean", targetValue: 1, unit: "step" },
      { goalKind: "quantity", targetValue: 1 },
      { goalKind: "quantity", targetValue: 1, unit: "step", extra: true },
    ]) {
      expect(() =>
        createHabitRequestSchema.parse({
          title: "Walk",
          icon: "🌿",
          colorToken: "mint",
          goal: invalidGoal,
          schedule: dailySchedule,
        }),
      ).toThrow();
    }

    expect(habitLogValueSchema.parse({ state: "skipped" })).toEqual({
      state: "skipped",
      quantity: null,
      note: null,
    });
    expect(() => habitLogValueSchema.parse({ state: "skipped", quantity: 1 })).toThrow();
    expect(() => habitLogValueSchema.parse({ state: "completed", quantity: 1, extra: true })).toThrow();
  });

  it("accepts only canonical supported schedule shapes", () => {
    expect(habitScheduleValueSchema.parse(dailySchedule)).toEqual(dailySchedule);
    expect(
      habitScheduleValueSchema.parse({
        ...dailySchedule,
        kind: "weekdays",
        weekdays: [1, 3, 5],
      }),
    ).toMatchObject({ kind: "weekdays", weekdays: [1, 3, 5] });
    expect(
      habitScheduleValueSchema.parse({
        ...dailySchedule,
        kind: "weekly_target",
        targetPerWeek: 7,
      }),
    ).toMatchObject({ kind: "weekly_target", targetPerWeek: 7 });

    for (const invalid of [
      { ...dailySchedule, weekdays: [1] },
      { ...dailySchedule, kind: "weekdays", weekdays: [3, 1] },
      { ...dailySchedule, kind: "weekdays", weekdays: [1, 1] },
      { ...dailySchedule, kind: "weekly_target", targetPerWeek: 0 },
      { ...dailySchedule, kind: "weekly_target", targetPerWeek: 8 },
      { ...dailySchedule, timezone: "US/Eastern" },
      { ...dailySchedule, startDate: "0000-01-01" },
      { ...dailySchedule, endDate: "0000-12-31" },
    ]) {
      expect(() => habitScheduleValueSchema.parse(invalid)).toThrow();
    }
  });

  it("caps an inclusive history request at 366 local days", () => {
    expect(habitHistoryQuerySchema.parse({ startDate: "2025-07-21", endDate: "2026-07-21" })).toEqual({
      startDate: "2025-07-21",
      endDate: "2026-07-21",
    });
    expect(() => habitHistoryQuerySchema.parse({ startDate: "2025-07-20", endDate: "2026-07-21" })).toThrow();
    expect(() => habitHistoryQuerySchema.parse({ startDate: "2026-07-22", endDate: "2026-07-21" })).toThrow();
    expect(() => habitHistoryQuerySchema.parse({ startDate: "0000-01-01", endDate: "0000-01-02" })).toThrow();
  });

  it("keeps the Today source envelope strict with canonical ordered boundaries", () => {
    expect(
      habitTodayProjectionSchema.parse({
        rows: [],
        boundaries: [
          { timezone: "America/Los_Angeles", localDate: "2026-07-20" },
          { timezone: "Asia/Singapore", localDate: "2026-07-21" },
        ],
        nextCursor: null,
      }),
    ).toEqual({
      rows: [],
      boundaries: [
        { timezone: "America/Los_Angeles", localDate: "2026-07-20" },
        { timezone: "Asia/Singapore", localDate: "2026-07-21" },
      ],
      nextCursor: null,
    });
    expect(
      habitTodayBoundarySchema.safeParse({
        timezone: "UTC",
        localDate: "2026-07-21",
        extra: true,
      }).success,
    ).toBe(false);
    for (const boundaries of [
      [
        { timezone: "UTC", localDate: "2026-07-21" },
        { timezone: "UTC", localDate: "2026-07-21" },
      ],
      [
        { timezone: "UTC", localDate: "2026-07-21" },
        { timezone: "Asia/Singapore", localDate: "2026-07-21" },
      ],
    ]) {
      expect(habitTodayProjectionSchema.safeParse({ rows: [], boundaries, nextCursor: null }).success).toBe(
        false,
      );
    }
  });
});
