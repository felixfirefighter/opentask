import { describe, expect, it } from "vitest";

import { buildDemoHabitFixture, DEMO_HABIT_TIMEZONE } from "./demo-habit-fixture";

describe("demo habit fixture", () => {
  it("builds the same bounded habit story for the same reset instant", () => {
    const resetAt = new Date("2026-07-21T08:00:00.000Z");
    const first = buildDemoHabitFixture(resetAt);
    const second = buildDemoHabitFixture(new Date(resetAt));

    expect(second).toEqual(first);
    expect(first.habits).toHaveLength(4);
    expect(first.schedules).toHaveLength(4);
    expect(first.logs).toHaveLength(6);
    expect(first.habits.filter(({ archivedAt }) => archivedAt !== null)).toHaveLength(1);
    expect(first.schedules.map(({ schedule }) => schedule.kind).sort()).toEqual([
      "daily",
      "daily",
      "weekdays",
      "weekly_target",
    ]);
    expect(first.schedules.every(({ schedule }) => schedule.timezone === DEMO_HABIT_TIMEZONE)).toBe(true);
  });

  it("includes boolean, numeric, weekly-target, and archived-history examples", () => {
    const fixture = buildDemoHabitFixture(new Date("2026-07-21T08:00:00.000Z"));
    const byTitle = new Map(fixture.habits.map((habit) => [habit.definition.title, habit]));

    expect(byTitle.get("Drink water")?.definition).toMatchObject({
      goalKind: "quantity",
      targetValue: 8,
      unit: "glasses",
    });
    const numeric = byTitle.get("Drink water")!;
    expect(fixture.schedules.find(({ habitId }) => habitId === numeric.id)?.schedule).toMatchObject({
      kind: "weekdays",
      weekdays: [1, 3, 5],
    });
    expect(byTitle.get("Morning reset")?.definition).toMatchObject({
      goalKind: "boolean",
      targetValue: null,
      unit: null,
    });
    const archived = byTitle.get("Read before bed")!;
    expect(archived).toMatchObject({ version: 2, archivedAt: fixture.resetAt });
    expect(fixture.logs.some(({ habitId }) => habitId === archived.id)).toBe(true);

    const weekly = byTitle.get("Move with intention")!;
    expect(fixture.schedules.find(({ habitId }) => habitId === weekly.id)?.schedule).toMatchObject({
      kind: "weekly_target",
      targetPerWeek: 3,
    });
  });
});
