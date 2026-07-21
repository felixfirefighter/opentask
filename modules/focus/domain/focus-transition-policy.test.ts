import { describe, expect, it } from "vitest";

import { FOCUS_RECORDED_SECONDS_MAX, FOCUS_VERSION_MAX } from "./focus-limits";
import type { FocusSession } from "./focus-session-policy";
import { reconstructFocusTimer } from "./focus-timer-policy";
import { decideFocusTransition } from "./focus-transition-policy";

describe("focus transition policy", () => {
  it("accumulates each active segment once and resets the anchor on resume", () => {
    const active = session({
      accumulatedActiveSeconds: 10,
      startedAt: new Date("2026-07-21T00:00:00.250Z"),
      updatedAt: new Date("2026-07-21T00:00:00.250Z"),
    });
    const paused = applied(
      decideFocusTransition({
        session: active,
        command: "pause",
        expectedVersion: 1,
        now: new Date("2026-07-21T00:00:05.999Z"),
      }),
    );
    expect(paused).toMatchObject({ state: "paused", accumulatedActiveSeconds: 15, version: 2 });

    const resumedAt = new Date("2026-07-21T00:01:00.000Z");
    const resumed = applied(
      decideFocusTransition({
        session: paused,
        command: "resume",
        expectedVersion: 2,
        now: resumedAt,
      }),
    );
    expect(resumed).toMatchObject({
      state: "active",
      accumulatedActiveSeconds: 15,
      pausedAt: null,
      version: 3,
    });
    expect(resumed.startedAt).toEqual(resumedAt);

    const completed = applied(
      decideFocusTransition({
        session: resumed,
        command: "finish",
        expectedVersion: 3,
        now: new Date("2026-07-21T00:01:03.999Z"),
      }),
    );
    expect(completed).toMatchObject({
      state: "completed",
      accumulatedActiveSeconds: 18,
      pausedAt: null,
      version: 4,
    });
  });

  it("finishes a paused session without counting paused wall time", () => {
    const paused = session({
      state: "paused",
      accumulatedActiveSeconds: 120,
      pausedAt: new Date("2026-07-21T00:02:00.000Z"),
      updatedAt: new Date("2026-07-21T00:02:00.000Z"),
    });
    expect(
      applied(
        decideFocusTransition({
          session: paused,
          command: "finish",
          expectedVersion: 1,
          now: new Date("2026-07-21T09:00:00.000Z"),
        }),
      ),
    ).toMatchObject({ state: "completed", accumulatedActiveSeconds: 120 });
  });

  it("recognizes exact response-lost replays and closes every other transition", () => {
    const paused = session({ state: "paused", pausedAt: new Date("2026-07-21T00:01:00.000Z"), version: 2 });
    expect(
      decideFocusTransition({ session: paused, command: "pause", expectedVersion: 1, now: paused.pausedAt! }),
    ).toMatchObject({ kind: "replay" });
    expect(
      decideFocusTransition({
        session: paused,
        command: "resume",
        expectedVersion: 1,
        now: paused.pausedAt!,
      }),
    ).toEqual({ kind: "stale" });
    expect(
      decideFocusTransition({ session: paused, command: "pause", expectedVersion: 2, now: paused.pausedAt! }),
    ).toEqual({ kind: "closed", state: "paused" });

    const completed = session({
      state: "completed",
      endedAt: new Date("2026-07-21T00:02:00.000Z"),
      version: 3,
    });
    expect(
      decideFocusTransition({
        session: completed,
        command: "finish",
        expectedVersion: 2,
        now: completed.endedAt!,
      }),
    ).toMatchObject({ kind: "replay" });
    expect(
      decideFocusTransition({
        session: completed,
        command: "resume",
        expectedVersion: 3,
        now: completed.endedAt!,
      }),
    ).toEqual({ kind: "closed", state: "completed" });
  });

  it("guards authoritative chronology, recorded seconds, and versions", () => {
    expect(() =>
      decideFocusTransition({
        session: session(),
        command: "pause",
        expectedVersion: 1,
        now: new Date("2026-07-20T23:59:59.999Z"),
      }),
    ).toThrow(/precede/);
    expect(() =>
      decideFocusTransition({
        session: session({ accumulatedActiveSeconds: FOCUS_RECORDED_SECONDS_MAX }),
        command: "finish",
        expectedVersion: 1,
        now: new Date("2026-07-21T00:00:01.000Z"),
      }),
    ).toThrow(/exceeds/);
    expect(() =>
      decideFocusTransition({
        session: session({ version: FOCUS_VERSION_MAX }),
        command: "pause",
        expectedVersion: FOCUS_VERSION_MAX,
        now: new Date("2026-07-21T00:00:01.000Z"),
      }),
    ).toThrow(/version/);
  });
});

describe("authoritative focus timer reconstruction", () => {
  it("does not auto-finish at zero or overtime", () => {
    const atZero = reconstructFocusTimer(
      session({ plannedSeconds: 60 }),
      new Date("2026-07-21T00:01:00.000Z"),
    );
    expect(atZero).toMatchObject({
      state: "active",
      elapsedActiveSeconds: 60,
      remainingSeconds: 0,
      overtimeSeconds: 0,
      planReached: true,
    });

    const overtime = reconstructFocusTimer(
      session({ plannedSeconds: 60 }),
      new Date("2026-07-21T00:01:07.500Z"),
    );
    expect(overtime).toMatchObject({ state: "active", remainingSeconds: 0, overtimeSeconds: 7 });
  });

  it("ticks only active sessions and exposes no countdown for stopwatch", () => {
    expect(
      reconstructFocusTimer(
        session({
          mode: "stopwatch",
          plannedSeconds: null,
          state: "paused",
          pausedAt: new Date("2026-07-21T00:00:05.000Z"),
          accumulatedActiveSeconds: 5,
        }),
        new Date("2026-07-22T00:00:00.000Z"),
      ),
    ).toMatchObject({
      state: "paused",
      elapsedActiveSeconds: 5,
      remainingSeconds: null,
      overtimeSeconds: 0,
      planReached: false,
    });
  });
});

function applied(decision: ReturnType<typeof decideFocusTransition>): FocusSession {
  if (decision.kind !== "apply") throw new Error(`Expected apply, received ${decision.kind}.`);
  return decision.session;
}

function session(overrides: Partial<FocusSession> = {}): FocusSession {
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
    accumulatedActiveSeconds: 0,
    plannedSeconds: 1_500,
    endedAt: null,
    version: 1,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}
