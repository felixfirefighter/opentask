import { describe, expect, it } from "vitest";

import { PORTABLE_FOCUS_SECTION_SCHEMA_VERSION } from "./export-contract-primitives";
import { portableFocusSectionSchema } from "./export-focus-contract";

const instant = "2026-07-20T02:00:00.000Z";

describe("portable Focus export contract", () => {
  it("accepts only canonical completed-focus facts", () => {
    const parsed = portableFocusSectionSchema.parse({
      schemaVersion: PORTABLE_FOCUS_SECTION_SCHEMA_VERSION,
      sessions: [pomodoro(), stopwatch()],
    });

    expect(parsed.sessions).toHaveLength(2);
    expect(parsed.sessions[0]).toMatchObject({ mode: "pomodoro", plannedSeconds: 1_500 });
    expect(parsed.sessions[1]).toMatchObject({ mode: "stopwatch", plannedSeconds: null });
  });

  it("rejects invalid modes, plans, links, ordering, and unexpected lifecycle fields", () => {
    expect(
      portableFocusSectionSchema.safeParse({
        schemaVersion: 1,
        sessions: [{ ...pomodoro(), plannedSeconds: 61 }],
      }).success,
    ).toBe(false);
    expect(
      portableFocusSectionSchema.safeParse({
        schemaVersion: 1,
        sessions: [{ ...stopwatch(), plannedSeconds: 300 }],
      }).success,
    ).toBe(false);
    expect(
      portableFocusSectionSchema.safeParse({
        schemaVersion: 1,
        sessions: [{ ...pomodoro(), habitId: "55555555-5555-4555-8555-555555555555" }],
      }).success,
    ).toBe(false);
    expect(
      portableFocusSectionSchema.safeParse({
        schemaVersion: 1,
        sessions: [{ ...pomodoro(), endedAt: "2026-07-20T01:59:59.000Z" }],
      }).success,
    ).toBe(false);
    expect(
      portableFocusSectionSchema.safeParse({
        schemaVersion: 1,
        sessions: [{ ...pomodoro(), state: "completed" }],
      }).success,
    ).toBe(false);
  });
});

function pomodoro() {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    taskId: "44444444-4444-4444-8444-444444444444",
    habitId: null,
    mode: "pomodoro" as const,
    accumulatedActiveSeconds: 1_500,
    plannedSeconds: 1_500,
    startedAt: instant,
    endedAt: "2026-07-20T02:25:00.000Z",
    version: 1,
    createdAt: instant,
    updatedAt: "2026-07-20T02:25:00.000Z",
  };
}

function stopwatch() {
  return {
    ...pomodoro(),
    id: "66666666-6666-4666-8666-666666666666",
    taskId: null,
    mode: "stopwatch" as const,
    accumulatedActiveSeconds: 900,
    plannedSeconds: null,
  };
}
