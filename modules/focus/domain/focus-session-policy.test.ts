import { describe, expect, it } from "vitest";

import {
  assertFocusSession,
  normalizeFocusCorrectionSeconds,
  normalizeFocusStartSpec,
} from "./focus-session-policy";

describe("focus session policy", () => {
  it("requires per-run durations and normalizes strict start discriminants", () => {
    expect(
      normalizeFocusStartSpec({
        kind: "focus",
        mode: "pomodoro",
        plannedSeconds: 1_500,
      }),
    ).toEqual({
      kind: "focus",
      mode: "pomodoro",
      plannedSeconds: 1_500,
      taskId: null,
      habitId: null,
    });
    expect(
      normalizeFocusStartSpec({
        kind: "break",
        mode: "pomodoro",
        plannedSeconds: 300,
      }),
    ).toEqual({
      kind: "break",
      mode: "pomodoro",
      plannedSeconds: 300,
      taskId: null,
      habitId: null,
    });
    expect(
      normalizeFocusStartSpec({ kind: "focus", mode: "stopwatch", taskId: "task", plannedSeconds: null }),
    ).toEqual({
      kind: "focus",
      mode: "stopwatch",
      plannedSeconds: null,
      taskId: "task",
      habitId: null,
    });

    expect(() => normalizeFocusStartSpec({ kind: "break", mode: "stopwatch", plannedSeconds: null })).toThrow(
      /Pomodoro/,
    );
    expect(() => normalizeFocusStartSpec({ kind: "break", mode: "pomodoro", taskId: "task" })).toThrow(
      /cannot link/,
    );
    expect(() => normalizeFocusStartSpec({ kind: "focus", mode: "stopwatch", plannedSeconds: 60 })).toThrow(
      /planned duration/,
    );
    expect(() => normalizeFocusStartSpec({ kind: "focus", mode: "pomodoro", plannedSeconds: null })).toThrow(
      /required/,
    );
    expect(() => normalizeFocusStartSpec({ kind: "focus", mode: "pomodoro" })).toThrow(/required/);
    expect(() => normalizeFocusStartSpec({ kind: "break", mode: "pomodoro" })).toThrow(/required/);
    expect(() =>
      normalizeFocusStartSpec({
        kind: "focus",
        mode: "pomodoro",
        taskId: "task",
        habitId: "habit",
      }),
    ).toThrow(/not both/);
  });

  it("accepts only whole-minute planned intervals inside the kind-specific ranges", () => {
    for (const plannedSeconds of [60, 1_500, 14_400]) {
      expect(normalizeFocusStartSpec({ kind: "focus", mode: "pomodoro", plannedSeconds })).toMatchObject({
        plannedSeconds,
      });
    }
    for (const plannedSeconds of [60, 300, 3_600]) {
      expect(normalizeFocusStartSpec({ kind: "break", mode: "pomodoro", plannedSeconds })).toMatchObject({
        plannedSeconds,
      });
    }
    for (const plannedSeconds of [0, 61, 14_460, 1.5, Number.NaN]) {
      expect(() => normalizeFocusStartSpec({ kind: "focus", mode: "pomodoro", plannedSeconds })).toThrow(
        /whole-minute/,
      );
    }
    expect(() => normalizeFocusStartSpec({ kind: "break", mode: "pomodoro", plannedSeconds: 3_660 })).toThrow(
      /whole-minute/,
    );
  });

  it("freezes correction and persisted-duration integer limits", () => {
    expect(normalizeFocusCorrectionSeconds(0)).toBe(0);
    expect(normalizeFocusCorrectionSeconds(604_800)).toBe(604_800);
    for (const invalid of [-1, 604_801, 1.5, Number.POSITIVE_INFINITY]) {
      expect(() => normalizeFocusCorrectionSeconds(invalid)).toThrow(/whole number/);
    }

    expect(() =>
      assertFocusSession({
        id: "session",
        kind: "focus",
        mode: "stopwatch",
        state: "active",
        taskId: null,
        habitId: null,
        startedAt: new Date("2026-07-21T00:00:00.000Z"),
        pausedAt: null,
        accumulatedActiveSeconds: 2_147_483_648,
        plannedSeconds: null,
        endedAt: null,
        version: 1,
        createdAt: new Date("2026-07-21T00:00:00.000Z"),
        updatedAt: new Date("2026-07-21T00:00:00.000Z"),
      }),
    ).toThrow(/2147483647/);
  });

  it("mirrors persisted pause and completion chronology", () => {
    const base = {
      id: "session",
      kind: "focus" as const,
      mode: "pomodoro" as const,
      taskId: null,
      habitId: null,
      startedAt: new Date("2026-07-21T00:01:00.000Z"),
      accumulatedActiveSeconds: 60,
      plannedSeconds: 1_500,
      version: 2,
      createdAt: new Date("2026-07-21T00:00:00.000Z"),
      updatedAt: new Date("2026-07-21T00:01:00.000Z"),
    };

    expect(() =>
      assertFocusSession({
        ...base,
        state: "paused",
        pausedAt: new Date("2026-07-21T00:00:59.000Z"),
        endedAt: null,
      }),
    ).toThrow(/pause cannot precede/);
    expect(() =>
      assertFocusSession({
        ...base,
        state: "completed",
        pausedAt: null,
        endedAt: new Date("2026-07-21T00:00:59.000Z"),
      }),
    ).toThrow(/end cannot precede/);
  });
});
