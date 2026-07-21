import { describe, expect, it } from "vitest";

import type { HabitLogForProjection } from "./habit-day-policy";
import {
  HABIT_HISTORY_MAX_DAYS,
  buildHabitHistoryRange,
  buildHabitMonth,
  buildSevenDayStrip,
  habitMonthLocalDateRange,
} from "./habit-history-policy";

const booleanGoal = { goalKind: "boolean", targetValue: null, unit: null } as const;
const daily = {
  kind: "daily",
  weekdays: null,
  targetPerWeek: null,
  timezone: "UTC",
  startDate: "2028-02-03",
  endDate: "2028-02-27",
} as const;

const completed = (localDate: string, quantity: number | null = null): HabitLogForProjection => ({
  localDate,
  state: "completed",
  quantity,
});

describe("habit history projections", () => {
  it("builds a chronological seven-day strip with explicit day states", () => {
    const schedule = {
      kind: "weekdays",
      weekdays: [1, 3, 5],
      targetPerWeek: null,
      timezone: "UTC",
      startDate: "2026-07-01",
      endDate: null,
    } as const;
    const strip = buildSevenDayStrip(
      schedule,
      { goalKind: "quantity", targetValue: 2, unit: "litres" },
      [
        completed("2026-07-01", 2),
        completed("2026-07-02", 2),
        completed("2026-07-03", 1),
        { localDate: "2026-07-06", state: "skipped", quantity: null },
      ],
      "2026-07-07",
    );

    expect(strip.map(({ localDate, state, scheduled }) => ({ localDate, state, scheduled }))).toEqual([
      { localDate: "2026-07-01", state: "successful", scheduled: true },
      { localDate: "2026-07-02", state: "successful", scheduled: false },
      { localDate: "2026-07-03", state: "partial", scheduled: true },
      { localDate: "2026-07-04", state: "not_scheduled", scheduled: false },
      { localDate: "2026-07-05", state: "not_scheduled", scheduled: false },
      { localDate: "2026-07-06", state: "skipped", scheduled: true },
      { localDate: "2026-07-07", state: "not_scheduled", scheduled: false },
    ]);
  });

  it("preserves a recorded historical day after a schedule edit makes it unscheduled", () => {
    const schedule = {
      kind: "weekdays",
      weekdays: [1],
      targetPerWeek: null,
      timezone: "UTC",
      startDate: "2026-07-01",
      endDate: null,
    } as const;
    const thursday = buildHabitHistoryRange(
      schedule,
      booleanGoal,
      [completed("2026-07-02")],
      "2026-07-02",
      "2026-07-02",
      "2026-07-03",
    )[0];
    expect(thursday).toMatchObject({ state: "successful", scheduled: false, successful: true });
  });

  it("builds a leap-month heat map without storing derived counters", () => {
    const month = buildHabitMonth(
      daily,
      booleanGoal,
      [
        completed("2028-02-03"),
        { localDate: "2028-02-04", state: "unachieved", quantity: null },
        completed("2028-02-28"),
      ],
      "2028-02",
      "2028-02-15",
    );
    expect(month.yearMonth).toBe("2028-02");
    expect(month.days).toHaveLength(29);
    expect(month.recordedDays).toBe(3);
    expect(month.days[0]).toMatchObject({ localDate: "2028-02-01", state: "outside_range" });
    expect(month.days[2]).toMatchObject({ localDate: "2028-02-03", state: "successful" });
    expect(month.days[3]).toMatchObject({ localDate: "2028-02-04", state: "unachieved" });
    expect(month.days[14]).toMatchObject({ localDate: "2028-02-15", state: "open" });
    expect(month.days[15]).toMatchObject({ localDate: "2028-02-16", state: "future" });
    expect(month.days[27]).toMatchObject({
      localDate: "2028-02-28",
      state: "successful",
      scheduled: false,
    });
    expect(month.days[28]).toMatchObject({ localDate: "2028-02-29", state: "outside_range" });
  });

  it("represents a new habit month honestly with no recorded days", () => {
    const month = buildHabitMonth(daily, booleanGoal, [], "2028-02", "2028-02-10");
    expect(month.recordedDays).toBe(0);
    expect(month.days.some((day) => day.successful)).toBe(false);
  });

  it("derives the exact bounded read range for a calendar month", () => {
    expect(habitMonthLocalDateRange("2028-02")).toEqual({
      startDate: "2028-02-01",
      endDate: "2028-02-29",
    });
    expect(() => habitMonthLocalDateRange("0000-01")).toThrowError(/supported date range/i);
  });

  it("validates canonical bounded inclusive history ranges", () => {
    const single = buildHabitHistoryRange(daily, booleanGoal, [], "2028-02-03", "2028-02-03", "2028-02-03");
    expect(single).toHaveLength(1);
    expect(HABIT_HISTORY_MAX_DAYS).toBe(366);
    expect(() =>
      buildHabitHistoryRange(daily, booleanGoal, [], "2028-12-31", "2028-01-01", "2028-01-01"),
    ).toThrow(RangeError);
    expect(() =>
      buildHabitHistoryRange(
        { ...daily, startDate: "2027-01-01", endDate: null },
        booleanGoal,
        [],
        "2027-01-01",
        "2028-01-02",
        "2028-01-02",
      ),
    ).toThrowError(/366 local days/i);
    expect(() => buildHabitMonth(daily, booleanGoal, [], "2028-2", "2028-02-01")).toThrow(RangeError);
  });

  it("rejects duplicate effective logs before projecting", () => {
    expect(() =>
      buildSevenDayStrip(
        daily,
        booleanGoal,
        [completed("2028-02-03"), completed("2028-02-03")],
        "2028-02-03",
      ),
    ).toThrowError(/duplicate local dates/i);
  });
});
