import { describe, expect, it } from "vitest";

import {
  definitionUpdate,
  draftFromHabit,
  emptyHabitDraft,
  parseHabitDraft,
  scheduleUpdate,
} from "./habit-form-policy";
import { habitDetail } from "./habit-presentation-test-support";

describe("habit form policy", () => {
  it("builds a valid local daily habit without requiring a provider", () => {
    const parsed = parseHabitDraft({
      ...emptyHabitDraft("Asia/Singapore", "2026-07-20"),
      title: "  Morning walk  ",
    });

    expect(parsed).toEqual({
      success: true,
      value: expect.objectContaining({
        title: "Morning walk",
        goal: { goalKind: "boolean", targetValue: null, unit: null },
        schedule: expect.objectContaining({ kind: "daily", timezone: "Asia/Singapore" }),
      }),
    });
  });

  it("maps quantity and selected-weekday inputs to their discriminated contracts", () => {
    const parsed = parseHabitDraft({
      ...emptyHabitDraft("America/New_York", "2026-07-20"),
      title: "Drink water",
      goalKind: "quantity",
      targetValue: "2.5",
      unit: "litres",
      scheduleKind: "weekdays",
      weekdays: [5, 1, 3],
    });

    expect(parsed).toEqual({
      success: true,
      value: expect.objectContaining({
        goal: { goalKind: "quantity", targetValue: 2.5, unit: "litres" },
        schedule: expect.objectContaining({ kind: "weekdays", weekdays: [1, 3, 5] }),
      }),
    });
  });

  it("returns the owning form field for an invalid weekly target", () => {
    const result = parseHabitDraft({
      ...emptyHabitDraft("Asia/Singapore", "2026-07-20"),
      title: "Read",
      scheduleKind: "weekly_target",
      targetPerWeek: "8",
    });

    expect(result).toEqual(expect.objectContaining({ success: false, field: "targetPerWeek" }));
  });

  it("highlights the end date when the local schedule range is reversed", () => {
    const result = parseHabitDraft({
      ...emptyHabitDraft("Asia/Singapore", "2026-07-20"),
      title: "Read",
      endDate: "2026-07-19",
    });

    expect(result).toEqual({
      success: false,
      field: "endDate",
      message: "A habit schedule end date cannot precede its start date.",
    });
  });

  it("round-trips an existing definition and schedule without inventing fields", () => {
    const detail = habitDetail({
      title: "Strength session",
      goal: { goalKind: "quantity", targetValue: 30, unit: "minutes" },
    });
    const draft = draftFromHabit(detail);

    expect(draft).toEqual(
      expect.objectContaining({
        title: "Strength session",
        goalKind: "quantity",
        targetValue: "30",
        unit: "minutes",
      }),
    );
    expect(scheduleUpdate(draft)).toEqual(detail.schedule.schedule);
  });

  it("patches only definition fields changed from the reviewed base", () => {
    const detail = habitDetail({ title: "Server title", icon: "🔥", version: 3 });
    const draft = { ...draftFromHabit(detail), title: "Local title" };

    expect(definitionUpdate(detail, draft)).toEqual({
      expectedVersion: 3,
      patch: { title: "Local title" },
    });
    expect(definitionUpdate(detail, draftFromHabit(detail))).toBeNull();
  });
});
