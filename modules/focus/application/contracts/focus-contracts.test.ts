import { describe, expect, it } from "vitest";

import {
  correctCompletedSessionRequestSchema,
  focusHistoryCursorPayloadSchema,
  focusHistoryPageSchema,
  focusHistoryQuerySchema,
  focusLinkSearchInputSchema,
  focusSessionDtoSchema,
  focusStartInputSchema,
  focusStartRequestSchema,
  focusSummarySchema,
  focusTimerSnapshotSchema,
  focusTransitionRequestSchema,
} from "./index";

const sessionId = "10000000-0000-4000-8000-000000000001";
const taskId = "20000000-0000-4000-8000-000000000002";
const habitId = "30000000-0000-4000-8000-000000000003";
const userId = "40000000-0000-4000-8000-000000000004";

describe("focus start and mutation contracts", () => {
  it("requires explicit planned intervals and keeps every start variant strict", () => {
    expect(
      focusStartInputSchema.parse({
        id: sessionId.toUpperCase(),
        kind: "focus",
        mode: "pomodoro",
        plannedSeconds: 1_500,
        taskId,
      }),
    ).toEqual({
      id: sessionId,
      kind: "focus",
      mode: "pomodoro",
      plannedSeconds: 1_500,
      taskId,
      habitId: null,
    });
    expect(
      focusStartInputSchema.parse({ id: sessionId, kind: "break", mode: "pomodoro", plannedSeconds: 300 }),
    ).toMatchObject({ plannedSeconds: 300, taskId: null, habitId: null });
    expect(
      focusStartInputSchema.parse({ id: sessionId, kind: "focus", mode: "stopwatch", habitId }),
    ).toMatchObject({ plannedSeconds: null, taskId: null, habitId });

    expect(
      focusStartRequestSchema.parse({
        kind: "focus",
        mode: "pomodoro",
        plannedSeconds: 1_500,
        taskId,
      }),
    ).toMatchObject({ taskId, plannedSeconds: 1_500 });
    expect(
      focusStartRequestSchema.safeParse({
        id: sessionId,
        kind: "focus",
        mode: "pomodoro",
        plannedSeconds: 1_500,
      }).success,
    ).toBe(false);

    for (const invalid of [
      { id: sessionId, kind: "focus", mode: "pomodoro" },
      { id: sessionId, kind: "break", mode: "pomodoro" },
      { id: sessionId, kind: "break", mode: "stopwatch", plannedSeconds: null },
      { id: sessionId, kind: "focus", mode: "pomodoro", plannedSeconds: 61 },
      { id: sessionId, kind: "break", mode: "pomodoro", plannedSeconds: 3_660 },
      { id: sessionId, kind: "focus", mode: "pomodoro", plannedSeconds: 1_500, taskId, habitId },
      {
        id: sessionId,
        kind: "focus",
        mode: "pomodoro",
        plannedSeconds: 1_500,
        clientStartedAt: "2026-07-21T00:00:00.000Z",
      },
    ]) {
      expect(focusStartInputSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("accepts expectedVersion-only transitions and duration/link correction patches", () => {
    expect(focusTransitionRequestSchema.parse({ expectedVersion: 2 })).toEqual({ expectedVersion: 2 });
    expect(
      correctCompletedSessionRequestSchema.parse({
        expectedVersion: 2,
        patch: { durationSeconds: 1_800 },
      }),
    ).toMatchObject({ patch: { durationSeconds: 1_800 } });
    expect(correctCompletedSessionRequestSchema.parse({ expectedVersion: 2, patch: { link: null } })).toEqual(
      { expectedVersion: 2, patch: { link: null } },
    );
    expect(
      correctCompletedSessionRequestSchema.parse({
        expectedVersion: 2,
        patch: { link: { kind: "habit", id: habitId } },
      }),
    ).toMatchObject({ patch: { link: { kind: "habit", id: habitId } } });

    for (const invalid of [
      { expectedVersion: 2, patch: {} },
      { expectedVersion: 2, patch: { durationSeconds: 604_801 } },
      { expectedVersion: 2, patch: { link: { kind: "task", id: taskId, habitId } } },
      { expectedVersion: 2, now: "2026-07-21T00:00:00.000Z" },
    ]) {
      expect(correctCompletedSessionRequestSchema.safeParse(invalid).success).toBe(false);
    }
  });
});

describe("focus read contracts", () => {
  it("validates canonical session state and its authoritative timer snapshot", () => {
    const active = focusSessionDtoSchema.parse(sessionDto({ state: "active" }));
    expect(
      focusTimerSnapshotSchema.parse({
        session: active,
        link: null,
        authoritativeAt: "2026-07-21T00:01:00.000Z",
        elapsedActiveSeconds: 60,
        remainingSeconds: 1_440,
        overtimeSeconds: 0,
        planReached: false,
      }),
    ).toMatchObject({ elapsedActiveSeconds: 60, remainingSeconds: 1_440 });
    expect(
      focusTimerSnapshotSchema.safeParse({
        session: active,
        link: null,
        authoritativeAt: "2026-07-21T00:01:00.000Z",
        elapsedActiveSeconds: 1_501,
        remainingSeconds: 0,
        overtimeSeconds: 0,
        planReached: true,
      }).success,
    ).toBe(false);
    expect(focusSessionDtoSchema.safeParse(sessionDto({ state: "paused", pausedAt: null })).success).toBe(
      false,
    );
    expect(
      focusSessionDtoSchema.safeParse(sessionDto({ state: "paused", pausedAt: "2026-07-20T23:59:59.000Z" }))
        .success,
    ).toBe(false);
    expect(
      focusSessionDtoSchema.safeParse(sessionDto({ state: "completed", endedAt: "2026-07-20T23:59:59.000Z" }))
        .success,
    ).toBe(false);

    const linked = focusSessionDtoSchema.parse(sessionDto({ taskId }));
    expect(
      focusTimerSnapshotSchema.parse({
        session: linked,
        link: { kind: "task", id: taskId, label: null, availability: "unavailable" },
        authoritativeAt: "2026-07-21T00:01:00.000Z",
        elapsedActiveSeconds: 60,
        remainingSeconds: 1_440,
        overtimeSeconds: 0,
        planReached: false,
      }),
    ).toMatchObject({ link: { kind: "task", availability: "unavailable" } });
    expect(
      focusTimerSnapshotSchema.safeParse({
        session: linked,
        link: { kind: "habit", id: habitId, label: "Wrong item", availability: "available" },
        authoritativeAt: "2026-07-21T00:01:00.000Z",
        elapsedActiveSeconds: 60,
        remainingSeconds: 1_440,
        overtimeSeconds: 0,
        planReached: false,
      }).success,
    ).toBe(false);
  });

  it("keeps summary days coherent and history completed-focus-only with hydrated links", () => {
    const days = Array.from({ length: 7 }, (_, index) => ({
      localDate: `2026-07-${String(15 + index).padStart(2, "0")}`,
      totalSeconds: index === 6 ? 600 : 0,
    }));
    expect(
      focusSummarySchema.parse({
        timezone: "Asia/Singapore",
        todayLocalDate: "2026-07-21",
        todaySeconds: 600,
        sevenDaySeconds: 600,
        days,
      }),
    ).toMatchObject({ todaySeconds: 600, sevenDaySeconds: 600 });

    const completed = sessionDto({
      state: "completed",
      taskId,
      endedAt: "2026-07-21T00:25:00.000Z",
      accumulatedActiveSeconds: 1_500,
    });
    expect(
      focusHistoryPageSchema.parse({
        items: [
          {
            session: completed,
            link: { kind: "task", id: taskId, label: null, availability: "unavailable" },
          },
        ],
        nextCursor: null,
      }),
    ).toMatchObject({ items: [{ link: { availability: "unavailable" } }] });
    expect(
      focusHistoryPageSchema.safeParse({
        items: [
          {
            session: completed,
            link: {
              kind: "task",
              id: taskId,
              label: "Private deleted title",
              availability: "unavailable",
            },
          },
        ],
        nextCursor: null,
      }).success,
    ).toBe(false);
    expect(
      focusHistoryPageSchema.safeParse({
        items: [{ session: { ...completed, kind: "break", taskId: null }, link: null }],
        nextCursor: null,
      }).success,
    ).toBe(false);
    expect(focusHistoryQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(focusHistoryQuerySchema.parse({ limit: "50" })).toEqual({ limit: 50 });
    expect(() => focusHistoryQuerySchema.parse({ limit: 51 })).toThrow();
  });

  it("binds cursor payloads to the actor and the endedAt/id keyset", () => {
    expect(
      focusHistoryCursorPayloadSchema.parse({
        version: 1,
        userId,
        endedAt: "2026-07-21T00:25:00.000Z",
        id: sessionId,
      }),
    ).toEqual({ version: 1, userId, endedAt: "2026-07-21T00:25:00.000Z", id: sessionId });
  });

  it("rejects database-unsafe link search before a repository can receive it", () => {
    expect(focusLinkSearchInputSchema.safeParse({ q: "safe search", limit: 20 }).success).toBe(true);
    expect(focusLinkSearchInputSchema.safeParse({ q: "unsafe\0search", limit: 20 }).success).toBe(false);
    expect(focusLinkSearchInputSchema.safeParse({ q: "\ud800", limit: 20 }).success).toBe(false);
  });
});

function sessionDto(overrides: Record<string, unknown> = {}) {
  return {
    id: sessionId,
    kind: "focus",
    mode: "pomodoro",
    state: "active",
    taskId: null,
    habitId: null,
    startedAt: "2026-07-21T00:00:00.000Z",
    pausedAt: null,
    accumulatedActiveSeconds: 0,
    plannedSeconds: 1_500,
    endedAt: null,
    version: 1,
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
    ...overrides,
  };
}
