import { describe, expect, it } from "vitest";

import type { FocusSession } from "./focus-session-policy";
import { decideFocusStart } from "./focus-start-policy";

const now = new Date("2026-07-21T04:00:00.000Z");

describe("focus start policy", () => {
  it("creates one authoritative active row from the injected clock", () => {
    const decision = decideFocusStart({
      id: "new-session",
      spec: { kind: "focus", mode: "pomodoro", plannedSeconds: 1_500, taskId: "task" },
      existingById: null,
      unfinishedSession: null,
      now,
    });

    expect(decision).toMatchObject({
      kind: "create",
      session: {
        id: "new-session",
        state: "active",
        plannedSeconds: 1_500,
        taskId: "task",
        habitId: null,
        accumulatedActiveSeconds: 0,
        version: 1,
      },
    });
    if (decision.kind === "create") {
      expect(decision.session.startedAt).toEqual(now);
      expect(decision.session.startedAt).not.toBe(now);
    }
  });

  it("replays the same client UUID and rejects reuse with different immutable inputs", () => {
    const existing = session({ id: "request-id", state: "completed", endedAt: now });
    expect(
      decideFocusStart({
        id: "request-id",
        spec: { kind: "focus", mode: "pomodoro", plannedSeconds: 1_500 },
        existingById: existing,
        unfinishedSession: null,
        now,
      }),
    ).toMatchObject({ kind: "replay", session: { id: "request-id", state: "completed" } });

    expect(
      decideFocusStart({
        id: "request-id",
        spec: { kind: "focus", mode: "pomodoro", plannedSeconds: 1_800 },
        existingById: existing,
        unfinishedSession: null,
        now,
      }),
    ).toEqual({ kind: "conflict", reason: "session_id_reused" });
  });

  it("recovers a different unfinished session instead of creating a second timer", () => {
    const unfinished = session({ id: "already-running", state: "paused", pausedAt: now });
    expect(
      decideFocusStart({
        id: "new-request",
        spec: { kind: "break", mode: "pomodoro", plannedSeconds: 300 },
        existingById: null,
        unfinishedSession: unfinished,
        now,
      }),
    ).toMatchObject({ kind: "recover", session: { id: "already-running", state: "paused" } });
  });

  it("prefers the authoritative unfinished timer over a completed same-ID replay", () => {
    const completed = session({ id: "request-id", state: "completed", endedAt: now });
    const unfinished = session({ id: "current-timer", state: "paused", pausedAt: now });

    expect(
      decideFocusStart({
        id: "request-id",
        spec: { kind: "focus", mode: "pomodoro", plannedSeconds: 1_500 },
        existingById: completed,
        unfinishedSession: unfinished,
        now,
      }),
    ).toMatchObject({ kind: "recover", session: { id: "current-timer", state: "paused" } });
  });
});

function session(overrides: Partial<FocusSession> = {}): FocusSession {
  const createdAt = new Date("2026-07-21T03:00:00.000Z");
  return {
    id: "session",
    kind: "focus",
    mode: "pomodoro",
    state: "active",
    taskId: null,
    habitId: null,
    startedAt: createdAt,
    pausedAt: null,
    accumulatedActiveSeconds: 0,
    plannedSeconds: 1_500,
    endedAt: null,
    version: 1,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}
