import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";

import type { HabitLogForProjection } from "./habit-day-policy";
import type { HabitGoal } from "./habit-goal-policy";
import type { HabitSchedule } from "./habit-schedule-policy";
import { createHabitStreakAccumulator } from "./habit-streak-accumulator";
import { projectHabitStreaks } from "./habit-streak-policy";
import { localDateAtInstant } from "./habit-time-policy";

const booleanGoal = { goalKind: "boolean", targetValue: null, unit: null } as const;
const quantityGoal = { goalKind: "quantity", targetValue: 3, unit: "pages" } as const;

const completed = (localDate: string, quantity: number | null = null): HabitLogForProjection => ({
  localDate,
  state: "completed",
  quantity,
});

function streamedProjection(
  schedule: HabitSchedule,
  goal: HabitGoal,
  logs: readonly HabitLogForProjection[],
  currentLocalDate: string,
) {
  const accumulator = createHabitStreakAccumulator(schedule, goal, currentLocalDate);
  for (const log of logs) accumulator.add(log);
  return accumulator.finish();
}

function expectParity(
  schedule: HabitSchedule,
  goal: HabitGoal,
  logs: readonly HabitLogForProjection[],
  currentLocalDate: string,
  label?: string,
): void {
  expect(streamedProjection(schedule, goal, logs, currentLocalDate), label).toEqual(
    projectHabitStreaks(schedule, goal, logs, currentLocalDate),
  );
}

describe("habit streak streaming reducer", () => {
  const daily = {
    kind: "daily",
    weekdays: null,
    targetPerWeek: null,
    timezone: "UTC",
    startDate: "2026-01-01",
    endDate: null,
  } as const;

  it("matches open, partial, explicit-failure, missing-day, and future-log daily behavior", () => {
    const prior = ["2026-01-01", "2026-01-02", "2026-01-03"].map((date) => completed(date, 3));
    const scenarios: readonly (readonly HabitLogForProjection[])[] = [
      prior,
      [...prior, completed("2026-01-04", 1)],
      [...prior, { localDate: "2026-01-04", state: "skipped", quantity: null }],
      [...prior, { localDate: "2026-01-04", state: "unachieved", quantity: null }],
      [completed("2026-01-01", 3), completed("2026-01-03", 3)],
      [...prior, completed("2026-01-05", 3)],
    ];

    for (const logs of scenarios) expectParity(daily, quantityGoal, logs, "2026-01-04");
  });

  it("matches selected-weekday gaps and inclusive schedule bounds", () => {
    const weekdays = {
      kind: "weekdays",
      weekdays: [1, 3, 5],
      targetPerWeek: null,
      timezone: "UTC",
      startDate: "2026-01-05",
      endDate: "2026-01-16",
    } as const;
    const logs: HabitLogForProjection[] = [
      completed("2026-01-02"),
      completed("2026-01-05"),
      completed("2026-01-06"),
      completed("2026-01-07"),
      completed("2026-01-09"),
      completed("2026-01-12"),
      completed("2026-01-16"),
      completed("2026-01-19"),
    ];

    expectParity(weekdays, booleanGoal, logs, "2026-01-18");
    expect(streamedProjection(weekdays, booleanGoal, logs, "2026-01-18")).toEqual({
      cadence: "day",
      current: 1,
      best: 4,
    });
    expectParity(weekdays, booleanGoal, logs, "2026-01-01");
  });

  it("matches ISO-week progress, open-week fallback, closed failure, and end-date behavior", () => {
    const weekly = {
      kind: "weekly_target",
      weekdays: null,
      targetPerWeek: 3,
      timezone: "Asia/Singapore",
      startDate: "2025-12-29",
      endDate: null,
    } as const;
    const logs = [
      completed("2025-12-29"),
      completed("2026-01-01"),
      completed("2026-01-04"),
      completed("2026-01-05"),
      completed("2026-01-07"),
      completed("2026-01-11"),
      completed("2026-01-12"),
      { localDate: "2026-01-13", state: "skipped", quantity: null } as const,
      { localDate: "2026-01-14", state: "unachieved", quantity: null } as const,
      completed("2026-01-18"),
    ];

    for (const currentDate of ["2026-01-12", "2026-01-18", "2026-01-19"]) {
      expectParity(weekly, booleanGoal, logs, currentDate);
    }
    expect(streamedProjection(weekly, booleanGoal, logs, "2026-01-18")).toMatchObject({
      cadence: "week",
      current: 2,
      best: 2,
      currentWeek: { successfulDays: 2, state: "in_progress" },
    });
    expect(streamedProjection(weekly, booleanGoal, logs, "2026-01-19")).toMatchObject({
      cadence: "week",
      current: 0,
      best: 2,
    });

    expectParity({ ...weekly, endDate: "2026-01-14" }, booleanGoal, logs, "2026-01-18");
    expectParity({ ...weekly, endDate: "2026-01-14" }, booleanGoal, logs, "2026-01-19");
  });

  it("re-evaluates historical and post-target edits against the current quantity goal", () => {
    const weekly = {
      kind: "weekly_target",
      weekdays: null,
      targetPerWeek: 3,
      timezone: "UTC",
      startDate: "2026-01-05",
      endDate: null,
    } as const;
    const editedLogs = [
      completed("2026-01-05", 4),
      completed("2026-01-06", 2),
      completed("2026-01-07", 4),
      completed("2026-01-08", 4),
    ];

    expectParity(weekly, quantityGoal, editedLogs, "2026-01-08");
    expect(streamedProjection(weekly, quantityGoal, editedLogs, "2026-01-08")).toMatchObject({
      current: 1,
      best: 1,
      currentWeek: { successfulDays: 3, state: "achieved" },
    });

    const afterUndo = editedLogs.slice(0, 3);
    expectParity(weekly, quantityGoal, afterUndo, "2026-01-08");
    expect(streamedProjection(weekly, quantityGoal, afterUndo, "2026-01-08")).toMatchObject({
      current: 0,
      currentWeek: { successfulDays: 2, state: "in_progress" },
    });

    expectParity(weekly, { goalKind: "quantity", targetValue: 5, unit: "pages" }, editedLogs, "2026-01-08");
  });

  it("uses already-resolved local dates across spring-forward and fall-back transitions", () => {
    const schedule = {
      ...daily,
      timezone: "America/New_York",
      startDate: "2026-03-06",
    } as const;
    const springDate = localDateAtInstant("2026-03-08T07:30:00Z", schedule.timezone);
    expectParity(schedule, booleanGoal, [completed("2026-03-06"), completed("2026-03-07")], springDate);

    const fallDate = localDateAtInstant("2026-11-01T06:30:00Z", schedule.timezone);
    expectParity(schedule, booleanGoal, [completed("2026-10-30"), completed("2026-10-31")], fallDate);
  });

  it("accepts bounded-page feeding and has a terminal, idempotent finish", () => {
    const logs = Array.from({ length: 40 }, (_, offset) =>
      completed(Temporal.PlainDate.from("2026-01-01").add({ days: offset }).toString()),
    );
    const accumulator = createHabitStreakAccumulator(daily, booleanGoal, "2026-02-09");
    for (let pageStart = 0; pageStart < logs.length; pageStart += 7) {
      for (const log of logs.slice(pageStart, pageStart + 7)) accumulator.add(log);
    }
    const first = accumulator.finish();
    expect(first).toEqual(projectHabitStreaks(daily, booleanGoal, logs, "2026-02-09"));
    expect(accumulator.finish()).toBe(first);
    expect(() => accumulator.add(completed("2026-02-10"))).toThrowError(/after.*finished/i);
  });

  it("rejects duplicate, descending, and non-canonical stream dates", () => {
    const duplicate = createHabitStreakAccumulator(daily, booleanGoal, "2026-01-05");
    duplicate.add(completed("2026-01-01"));
    expect(() => duplicate.add(completed("2026-01-01"))).toThrowError(/duplicate local dates/i);

    const descending = createHabitStreakAccumulator(daily, booleanGoal, "2026-01-05");
    descending.add(completed("2026-01-02"));
    expect(() => descending.add(completed("2026-01-01"))).toThrowError(/ascending local date/i);

    const invalid = createHabitStreakAccumulator(daily, booleanGoal, "2026-01-05");
    expect(() => invalid.add(completed("2026-1-1"))).toThrowError(/invalid|YYYY-MM-DD/i);
  });
});

describe("streaming-to-batch property parity", () => {
  const stateVariants = [
    null,
    { state: "completed", quantity: 3 } as const,
    { state: "completed", quantity: 1 } as const,
    { state: "skipped", quantity: null } as const,
    { state: "unachieved", quantity: null } as const,
  ];

  const parityMatrices: readonly Readonly<{
    name: string;
    schedule: HabitSchedule;
    dates: readonly string[];
    currentDate: string;
  }>[] = [
    {
      name: "daily closed gaps and open today",
      schedule: {
        kind: "daily",
        weekdays: null,
        targetPerWeek: null,
        timezone: "UTC",
        startDate: "2026-01-01",
        endDate: null,
      },
      dates: ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"],
      currentDate: "2026-01-05",
    },
    {
      name: "selected weekdays across weekend gaps",
      schedule: {
        kind: "weekdays",
        weekdays: [1, 3, 5],
        targetPerWeek: null,
        timezone: "UTC",
        startDate: "2025-12-29",
        endDate: "2026-01-12",
      },
      dates: ["2025-12-29", "2025-12-31", "2026-01-02", "2026-01-05", "2026-01-12"],
      currentDate: "2026-01-12",
    },
    {
      name: "weekly target across an ISO year boundary",
      schedule: {
        kind: "weekly_target",
        weekdays: null,
        targetPerWeek: 3,
        timezone: "Asia/Singapore",
        startDate: "2025-12-29",
        endDate: null,
      },
      dates: ["2025-12-29", "2025-12-31", "2026-01-04", "2026-01-05", "2026-01-11"],
      currentDate: "2026-01-11",
    },
  ];

  for (const matrix of parityMatrices) {
    it(`matches every effective-log state combination for ${matrix.name}`, () => {
      const combinations = stateVariants.length ** matrix.dates.length;
      for (let encoded = 0; encoded < combinations; encoded += 1) {
        let cursor = encoded;
        const logs: HabitLogForProjection[] = [];
        for (const localDate of matrix.dates) {
          const variant = stateVariants[cursor % stateVariants.length] ?? null;
          cursor = Math.floor(cursor / stateVariants.length);
          if (variant !== null) logs.push({ localDate, ...variant });
        }
        expectParity(matrix.schedule, quantityGoal, logs, matrix.currentDate, `case ${encoded}`);
      }
    }, 20_000);
  }
});
