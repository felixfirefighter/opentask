import { describe, expect, it } from "vitest";

import type { HabitLogForProjection } from "./habit-day-policy";
import { localDateAtInstant } from "./habit-time-policy";
import {
  projectDailyHabitStreak,
  projectHabitStreaks,
  projectWeeklyTargetStreak,
} from "./habit-streak-policy";

const booleanGoal = { goalKind: "boolean", targetValue: null, unit: null } as const;
const completed = (localDate: string, quantity: number | null = null): HabitLogForProjection => ({
  localDate,
  state: "completed",
  quantity,
});

describe("daily and selected-weekday habit streaks", () => {
  const daily = {
    kind: "daily",
    weekdays: null,
    targetPerWeek: null,
    timezone: "UTC",
    startDate: "2026-07-01",
    endDate: null,
  } as const;

  it("keeps a prior streak open when today is missing or partial", () => {
    const prior = ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04"].map((date) => completed(date));
    expect(projectDailyHabitStreak(daily, booleanGoal, prior, "2026-07-05")).toEqual({
      current: 4,
      best: 4,
    });

    const numericGoal = { goalKind: "quantity", targetValue: 2, unit: "litres" } as const;
    const numericPrior = prior.map((log) => ({ ...log, quantity: 2 }));
    expect(
      projectDailyHabitStreak(
        daily,
        numericGoal,
        [...numericPrior, completed("2026-07-05", 1)],
        "2026-07-05",
      ),
    ).toEqual({ current: 4, best: 4 });
  });

  it("breaks the current streak immediately on an explicit failure today", () => {
    const logs: HabitLogForProjection[] = [
      completed("2026-07-01"),
      completed("2026-07-02"),
      { localDate: "2026-07-03", state: "skipped", quantity: null },
    ];
    expect(projectDailyHabitStreak(daily, booleanGoal, logs, "2026-07-03")).toEqual({
      current: 0,
      best: 2,
    });
  });

  it("treats a missing closed scheduled day as a break", () => {
    const logs = [completed("2026-07-01"), completed("2026-07-02"), completed("2026-07-04")];
    expect(projectDailyHabitStreak(daily, booleanGoal, logs, "2026-07-05")).toEqual({
      current: 1,
      best: 2,
    });
  });

  it("counts consecutive selected weekdays without treating weekends as gaps", () => {
    const weekdays = {
      kind: "weekdays",
      weekdays: [1, 3, 5],
      targetPerWeek: null,
      timezone: "UTC",
      startDate: "2026-07-01",
      endDate: null,
    } as const;
    const logs = [
      completed("2026-07-01"),
      completed("2026-07-03"),
      completed("2026-07-06"),
      completed("2026-07-08"),
      completed("2026-07-10"),
    ];
    expect(projectDailyHabitStreak(weekdays, booleanGoal, logs, "2026-07-13")).toEqual({
      current: 5,
      best: 5,
    });
  });

  it("re-derives historical success against an edited quantity target", () => {
    const logs = [completed("2026-07-01", 2), completed("2026-07-02", 3)];
    expect(
      projectDailyHabitStreak(
        daily,
        { goalKind: "quantity", targetValue: 2, unit: "pages" },
        logs,
        "2026-07-03",
      ),
    ).toEqual({ current: 2, best: 2 });
    expect(
      projectDailyHabitStreak(
        daily,
        { goalKind: "quantity", targetValue: 3, unit: "pages" },
        logs,
        "2026-07-03",
      ),
    ).toEqual({ current: 1, best: 1 });
  });

  it("uses the stored timezone to choose the DST-transition local day", () => {
    const currentDate = localDateAtInstant("2026-03-08T07:30:00Z", "America/New_York");
    const schedule = {
      ...daily,
      timezone: "America/New_York",
      startDate: "2026-03-06",
    } as const;
    expect(
      projectDailyHabitStreak(
        schedule,
        booleanGoal,
        [completed("2026-03-06"), completed("2026-03-07")],
        currentDate,
      ),
    ).toEqual({ current: 2, best: 2 });
  });
});

describe("ISO weekly-target habit streaks", () => {
  const weekly = {
    kind: "weekly_target",
    weekdays: null,
    targetPerWeek: 3,
    timezone: "Asia/Singapore",
    startDate: "2025-12-29",
    endDate: null,
  } as const;
  const firstWeek = ["2025-12-29", "2026-01-01", "2026-01-04"].map((date) => completed(date));
  const secondWeek = ["2026-01-05", "2026-01-06", "2026-01-07"].map((date) => completed(date));

  it("counts successful ISO weeks across a calendar-year boundary", () => {
    const projection = projectWeeklyTargetStreak(
      weekly,
      booleanGoal,
      [...firstWeek, ...secondWeek, completed("2026-01-12")],
      "2026-01-12",
    );
    expect(projection).toEqual({
      current: 2,
      best: 2,
      currentWeek: {
        weekStart: "2026-01-12",
        weekEnd: "2026-01-18",
        successfulDays: 1,
        targetPerWeek: 3,
        state: "in_progress",
      },
    });
  });

  it("does not let skip or unachieved close an under-target current week", () => {
    const projection = projectWeeklyTargetStreak(
      weekly,
      booleanGoal,
      [
        ...firstWeek,
        ...secondWeek,
        completed("2026-01-12"),
        { localDate: "2026-01-13", state: "skipped", quantity: null },
        { localDate: "2026-01-14", state: "unachieved", quantity: null },
      ],
      "2026-01-18",
    );
    expect(projection.current).toBe(2);
    expect(projection.currentWeek?.state).toBe("in_progress");
    expect(projection.currentWeek?.successfulDays).toBe(1);
  });

  it("adds the current week immediately when its target is reached", () => {
    const projection = projectWeeklyTargetStreak(
      weekly,
      booleanGoal,
      [
        ...firstWeek,
        ...secondWeek,
        completed("2026-01-12"),
        completed("2026-01-14"),
        completed("2026-01-18"),
      ],
      "2026-01-18",
    );
    expect(projection.current).toBe(3);
    expect(projection.best).toBe(3);
    expect(projection.currentWeek?.state).toBe("achieved");
  });

  it("fails an under-target week only after its Sunday closes", () => {
    const logs = [...firstWeek, ...secondWeek, completed("2026-01-12"), completed("2026-01-14")];
    expect(projectWeeklyTargetStreak(weekly, booleanGoal, logs, "2026-01-18").current).toBe(2);
    expect(projectWeeklyTargetStreak(weekly, booleanGoal, logs, "2026-01-19").current).toBe(0);
  });

  it("returns the unified cadence and rejects duplicate effective days", () => {
    expect(projectHabitStreaks(weekly, booleanGoal, firstWeek, "2026-01-05")).toMatchObject({
      cadence: "week",
      current: 1,
      best: 1,
    });
    expect(() =>
      projectWeeklyTargetStreak(
        weekly,
        booleanGoal,
        [completed("2026-01-01"), completed("2026-01-01")],
        "2026-01-04",
      ),
    ).toThrowError(/duplicate local dates/i);
  });
});
