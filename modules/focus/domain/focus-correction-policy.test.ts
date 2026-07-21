import { describe, expect, it } from "vitest";

import { decideFocusCorrection } from "./focus-correction-policy";
import { decideCompletedFocusDeletion, decideFocusDiscard } from "./focus-removal-policy";
import type { FocusSession } from "./focus-session-policy";

describe("completed focus correction", () => {
  it("replaces only duration and one optional link under an optimistic version", () => {
    const decision = decideFocusCorrection({
      session: completedSession(),
      expectedVersion: 1,
      correction: { durationSeconds: 1_800, link: { kind: "habit", id: "habit" } },
      now: new Date("2026-07-21T01:05:00.000Z"),
    });
    expect(decision).toMatchObject({
      kind: "apply",
      session: {
        state: "completed",
        accumulatedActiveSeconds: 1_800,
        taskId: null,
        habitId: "habit",
        version: 2,
      },
    });
  });

  it("returns no-op, exact replay, or stale without double-applying", () => {
    const current = completedSession({
      accumulatedActiveSeconds: 1_800,
      taskId: "task",
      version: 2,
    });
    const correction = { durationSeconds: 1_800, link: { kind: "task", id: "task" } } as const;
    expect(
      decideFocusCorrection({ session: current, expectedVersion: 2, correction, now: current.updatedAt }),
    ).toMatchObject({ kind: "no_op" });
    expect(
      decideFocusCorrection({ session: current, expectedVersion: 1, correction, now: current.updatedAt }),
    ).toMatchObject({ kind: "replay" });
    expect(
      decideFocusCorrection({
        session: current,
        expectedVersion: 1,
        correction: { ...correction, durationSeconds: 1_799 },
        now: current.updatedAt,
      }),
    ).toEqual({ kind: "stale" });
  });

  it("rejects break/noncompleted correction, an empty patch, and the correction cap", () => {
    expect(
      decideFocusCorrection({
        session: completedSession({ kind: "break" }),
        expectedVersion: 1,
        correction: { durationSeconds: 300 },
        now: new Date("2026-07-21T01:05:00.000Z"),
      }),
    ).toEqual({ kind: "closed", state: "completed" });
    expect(() =>
      decideFocusCorrection({
        session: completedSession(),
        expectedVersion: 1,
        correction: {},
        now: new Date("2026-07-21T01:05:00.000Z"),
      }),
    ).toThrow(/must change/);
    expect(() =>
      decideFocusCorrection({
        session: completedSession(),
        expectedVersion: 1,
        correction: { durationSeconds: 604_801 },
        now: new Date("2026-07-21T01:05:00.000Z"),
      }),
    ).toThrow(/604800/);
  });
});

describe("focus removal policy", () => {
  it("allows discard only while unfinished and history deletion only for completed focus", () => {
    expect(decideFocusDiscard(activeSession(), 1)).toEqual({ kind: "delete" });
    expect(decideFocusDiscard(completedSession(), 1)).toEqual({ kind: "closed", state: "completed" });
    expect(decideCompletedFocusDeletion(completedSession(), 1)).toEqual({ kind: "delete" });
    expect(decideCompletedFocusDeletion(activeSession(), 1)).toEqual({ kind: "closed", state: "active" });
    expect(decideCompletedFocusDeletion(completedSession({ kind: "break" }), 1)).toEqual({
      kind: "closed",
      state: "completed",
    });
    expect(decideFocusDiscard(activeSession({ version: 2 }), 1)).toEqual({ kind: "stale" });
  });
});

function activeSession(overrides: Partial<FocusSession> = {}): FocusSession {
  const createdAt = new Date("2026-07-21T00:00:00.000Z");
  return {
    id: "session",
    kind: "focus",
    mode: "pomodoro",
    state: "active",
    taskId: null,
    habitId: null,
    startedAt: createdAt,
    pausedAt: null,
    accumulatedActiveSeconds: 1_500,
    plannedSeconds: 1_500,
    endedAt: null,
    version: 1,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function completedSession(overrides: Partial<FocusSession> = {}): FocusSession {
  return activeSession({
    state: "completed",
    endedAt: new Date("2026-07-21T01:00:00.000Z"),
    ...overrides,
  });
}
