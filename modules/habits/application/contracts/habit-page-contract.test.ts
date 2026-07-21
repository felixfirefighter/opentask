import { describe, expect, it } from "vitest";

import { CANONICAL_IANA_TIME_ZONES } from "@/shared/validation/canonical-time-zones";

import { habitDefinitionPageSchema, habitLifecyclePageQuerySchema } from "./habit-contract";
import { HABIT_PAGE_MAX_ITEMS, habitPageQuerySchema } from "./habit-contract-primitives";
import { habitOverviewPageSchema, habitTodayProjectionSchema } from "./habit-projection-contract";

const habitId = "11111111-1111-4111-8111-111111111111";
const instant = "2026-07-21T01:02:03.000Z";
const localDate = "2026-07-21";

describe("habit page contracts", () => {
  it("coerces bounded limits, defaults the lifecycle, and rejects unknown query keys", () => {
    expect(habitPageQuerySchema.parse({ limit: "100" })).toEqual({ limit: 100 });
    expect(habitLifecyclePageQuerySchema.parse({})).toEqual({ limit: 50, lifecycle: "active" });
    expect(habitPageQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(habitPageQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(habitPageQuerySchema.safeParse({ ignored: "value" }).success).toBe(false);
  });

  it("bounds every public page collection at the approved request maximum", () => {
    const detail = habitDetail();
    const overview = habitOverview();
    const { today, ...overviewWithoutToday } = overview;
    const todayRow = { ...overviewWithoutToday, day: today, requiresAction: true };

    expect(
      habitDefinitionPageSchema.safeParse({
        items: Array.from({ length: HABIT_PAGE_MAX_ITEMS + 1 }, () => detail),
        nextCursor: null,
      }).success,
    ).toBe(false);
    expect(
      habitOverviewPageSchema.safeParse({
        items: Array.from({ length: HABIT_PAGE_MAX_ITEMS + 1 }, () => overview),
        nextCursor: null,
      }).success,
    ).toBe(false);
    expect(
      habitTodayProjectionSchema.safeParse({
        rows: Array.from({ length: HABIT_PAGE_MAX_ITEMS + 1 }, () => todayRow),
        boundaries: [],
        nextCursor: null,
      }).success,
    ).toBe(false);
  });

  it("bounds Today boundaries by the canonical timezone universe", () => {
    const boundaries = [
      ...CANONICAL_IANA_TIME_ZONES.map((timezone) => ({ timezone, localDate })),
      { timezone: CANONICAL_IANA_TIME_ZONES[0]!, localDate: "2026-07-22" },
    ].sort((left, right) =>
      left.timezone === right.timezone
        ? left.localDate.localeCompare(right.localDate)
        : left.timezone.localeCompare(right.timezone),
    );

    expect(habitTodayProjectionSchema.safeParse({ rows: [], boundaries, nextCursor: null }).success).toBe(
      false,
    );
  });
});

function habitDetail() {
  return {
    habit: {
      id: habitId,
      title: "Walk outside",
      icon: "W",
      colorToken: "mint",
      goal: { goalKind: "boolean", targetValue: null, unit: null },
      version: 1,
      createdAt: instant,
      updatedAt: instant,
      archivedAt: null,
    },
    schedule: {
      habitId,
      schedule: {
        kind: "daily",
        weekdays: null,
        targetPerWeek: null,
        timezone: "Asia/Singapore",
        startDate: "2026-07-01",
        endDate: null,
      },
      createdAt: instant,
      updatedAt: instant,
    },
  } as const;
}

function habitOverview() {
  const day = {
    localDate,
    scheduled: true,
    status: "open",
    successful: false,
    log: null,
  } as const;
  return {
    detail: habitDetail(),
    localDate,
    today: day,
    streak: { habitId, cadence: "day", current: 0, best: 0, evaluatedThrough: localDate },
    sevenDay: Array.from({ length: 7 }, () => day),
    weeklyProgress: null,
  } as const;
}
