import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database, DatabaseTransaction } from "@/shared/db/client";

import type { FocusLinkValidator, FocusLinkValidators, FocusOwnedLink } from "./contracts";
import { createFocusReadApplication, type FocusReadApplicationRepository } from "./focus-read-application";
import type { FocusReadSnapshot } from "./focus-read-snapshot";
import { encodeFocusHistoryCursor } from "./focus-history-cursor";
import type { StoredFocusSession } from "../infrastructure/focus-session-repository";

const actor: AuthenticatedActor = { userId: "10000000-0000-4000-8000-000000000001" };
const otherUserId = "10000000-0000-4000-8000-000000000002";
const firstSessionId = "70000000-0000-4000-8000-000000000003";
const secondSessionId = "70000000-0000-4000-8000-000000000002";
const thirdSessionId = "70000000-0000-4000-8000-000000000001";
const taskId = "20000000-0000-4000-8000-000000000001";
const habitId = "60000000-0000-4000-8000-000000000001";
const transaction = {} as DatabaseTransaction;

describe("focus read application", () => {
  it("rebuilds active time and hydrates an unavailable historical link in one snapshot", async () => {
    const active = activeRow({ taskId });
    const sessions = repository({ findUnfinished: vi.fn(async () => active) });
    const links = validators({ taskAvailable: false });

    await expect(
      application({
        sessions,
        links,
        now: new Date("2026-07-21T08:00:09.999Z"),
      }).getActiveFocusSession(actor),
    ).resolves.toMatchObject({
      elapsedActiveSeconds: 9,
      link: { kind: "task", id: taskId, label: null, availability: "unavailable" },
    });
    expect(sessions.findUnfinished).toHaveBeenCalledWith(actor.userId, transaction);
    expect(links.task.readOwned).toHaveBeenCalledWith(actor, taskId, transaction);
  });

  it("derives seven saved-timezone local days from one captured clock across DST", async () => {
    const sessions = repository({
      sumCompletedFocusByLocalDate: vi.fn(async () => [
        { localDate: "2026-03-08", totalSeconds: 900 },
        { localDate: "2026-03-09", totalSeconds: 1_800 },
      ]),
    });
    const read = application({
      sessions,
      links: validators(),
      now: new Date("2026-03-09T16:00:00.000Z"),
      timezone: "America/New_York",
    });

    const summary = await read.getFocusSummary(actor);

    expect(summary).toMatchObject({
      timezone: "America/New_York",
      todayLocalDate: "2026-03-09",
      todaySeconds: 1_800,
      sevenDaySeconds: 2_700,
    });
    expect(summary.days).toHaveLength(7);
    expect(summary.days[0]?.localDate).toBe("2026-03-03");
    expect(sessions.sumCompletedFocusByLocalDate).toHaveBeenCalledWith(
      actor.userId,
      "America/New_York",
      {
        startAt: new Date("2026-03-03T05:00:00.000Z"),
        endAt: new Date("2026-03-10T04:00:00.000Z"),
      },
      transaction,
    );
  });

  it("validates an actor-bound anchor and hydrates one page with two batch reads", async () => {
    const first = completedRow({
      id: firstSessionId,
      taskId,
      endedAt: new Date("2026-07-21T08:30:00.000Z"),
    });
    const second = completedRow({
      id: secondSessionId,
      habitId,
      endedAt: new Date("2026-07-21T08:20:00.000Z"),
    });
    const extra = completedRow({
      id: thirdSessionId,
      endedAt: new Date("2026-07-21T08:10:00.000Z"),
    });
    const sessions = repository({
      findCompletedFocusAnchor: vi.fn(async () => ({
        id: thirdSessionId,
        endedAt: new Date("2026-07-21T09:00:00.000Z"),
      })),
      listCompletedFocus: vi.fn(async () => [first, second, extra]),
    });
    const links = validators({ taskAvailable: true, habitAvailable: false });
    const cursor = encodeFocusHistoryCursor({
      version: 1,
      userId: actor.userId,
      endedAt: "2026-07-21T09:00:00.000Z",
      id: thirdSessionId,
    });

    const page = await application({ sessions, links }).listRecentFocusSessions(actor, {
      cursor,
      limit: 2,
    });

    expect(sessions.findCompletedFocusAnchor).toHaveBeenCalledWith(actor.userId, thirdSessionId, transaction);
    expect(sessions.listCompletedFocus).toHaveBeenCalledWith(
      actor.userId,
      {
        limit: 3,
        after: { id: thirdSessionId, endedAt: new Date("2026-07-21T09:00:00.000Z") },
      },
      transaction,
    );
    expect(links.task.readOwnedMany).toHaveBeenCalledWith(actor, [taskId], transaction);
    expect(links.habit.readOwnedMany).toHaveBeenCalledWith(actor, [habitId], transaction);
    expect(page.items).toMatchObject([
      { session: { id: firstSessionId }, link: { label: "Task label", availability: "available" } },
      { session: { id: secondSessionId }, link: { label: null, availability: "unavailable" } },
    ]);
    expect(page.nextCursor).not.toBeNull();
  });

  it("expires a changed anchor and rejects another actor's cursor before reading", async () => {
    const sessions = repository({
      findCompletedFocusAnchor: vi.fn(async () => ({
        id: firstSessionId,
        endedAt: new Date("2026-07-21T08:31:00.000Z"),
      })),
    });
    const read = application({ sessions, links: validators() });
    const cursor = encodeFocusHistoryCursor({
      version: 1,
      userId: actor.userId,
      endedAt: "2026-07-21T08:30:00.000Z",
      id: firstSessionId,
    });
    await expect(read.listRecentFocusSessions(actor, { cursor, limit: 20 })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });

    const foreignCursor = encodeFocusHistoryCursor({
      version: 1,
      userId: otherUserId,
      endedAt: "2026-07-21T08:30:00.000Z",
      id: firstSessionId,
    });
    await expect(
      read.listRecentFocusSessions(actor, { cursor: foreignCursor, limit: 20 }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(sessions.listCompletedFocus).not.toHaveBeenCalled();
  });

  it("merges available task and habit search results into one deterministic bounded list", async () => {
    const links = validators({
      taskSearch: [
        { kind: "task", id: taskId, label: "Zulu", available: true },
        {
          kind: "task",
          id: "20000000-0000-4000-8000-000000000002",
          label: null,
          available: false,
        },
      ],
      habitSearch: [{ kind: "habit", id: habitId, label: "Alpha", available: true }],
    });

    const result = await application({ links }).searchFocusLinks(actor, { q: " a ", limit: 2 });

    expect(result).toEqual([
      { kind: "habit", id: habitId, label: "Alpha", available: true },
      { kind: "task", id: taskId, label: "Zulu", available: true },
    ]);
    expect(links.task.searchOwned).toHaveBeenCalledWith(actor, { q: "a", limit: 2 });
    expect(links.habit.searchOwned).toHaveBeenCalledWith(actor, { q: "a", limit: 2 });
  });
});

function application({
  sessions = repository(),
  links,
  now = new Date("2026-07-21T09:00:00.000Z"),
  timezone = "UTC",
}: Readonly<{
  sessions?: FocusReadApplicationRepository;
  links: FocusLinkValidators;
  now?: Date;
  timezone?: string;
}>) {
  const snapshot: FocusReadSnapshot = { run: vi.fn((work) => work(transaction)) };
  return createFocusReadApplication({
    database: {} as Database,
    clock: { now: vi.fn(() => new Date(now)) },
    links,
    resolveUserTimezone: vi.fn(async () => timezone),
    snapshot,
    sessions,
  });
}

function repository(overrides: Partial<FocusReadApplicationRepository> = {}): FocusReadApplicationRepository {
  return {
    findCompletedFocusAnchor: vi.fn(async () => null),
    findUnfinished: vi.fn(async () => null),
    listCompletedFocus: vi.fn(async () => []),
    sumCompletedFocusByLocalDate: vi.fn(async () => []),
    ...overrides,
  };
}

function validators(
  options: Readonly<{
    taskAvailable?: boolean;
    habitAvailable?: boolean;
    taskSearch?: readonly FocusOwnedLink[];
    habitSearch?: readonly FocusOwnedLink[];
  }> = {},
): FocusLinkValidators {
  return {
    task: validator("task", taskId, "Task label", options.taskAvailable ?? true, options.taskSearch),
    habit: validator("habit", habitId, "Habit label", options.habitAvailable ?? true, options.habitSearch),
  };
}

function validator(
  kind: "task" | "habit",
  expectedId: string,
  label: string,
  available: boolean,
  search: readonly FocusOwnedLink[] = [],
): FocusLinkValidator {
  const owned = (id: string): FocusOwnedLink | null =>
    id === expectedId ? { kind, id, label: available ? label : null, available } : null;
  return {
    kind,
    readOwned: vi.fn(async (_actor, id) => owned(id)),
    readOwnedMany: vi.fn(async (_actor, ids) => ids.flatMap((id: string) => owned(id) ?? [])),
    searchOwned: vi.fn(async () => search),
  };
}

function completedRow(overrides: Partial<StoredFocusSession> = {}): StoredFocusSession {
  const endedAt = new Date("2026-07-21T08:25:00.000Z");
  return {
    id: firstSessionId,
    userId: actor.userId,
    taskId: null,
    habitId: null,
    kind: "focus",
    mode: "pomodoro",
    state: "completed",
    startedAt: new Date("2026-07-21T08:00:00.000Z"),
    pausedAt: null,
    accumulatedActiveSeconds: 1_500,
    plannedSeconds: 1_500,
    endedAt,
    version: 2,
    createdAt: new Date("2026-07-21T08:00:00.000Z"),
    updatedAt: endedAt,
    ...overrides,
  };
}

function activeRow(overrides: Partial<StoredFocusSession> = {}): StoredFocusSession {
  const startedAt = new Date("2026-07-21T08:00:00.000Z");
  return {
    id: firstSessionId,
    userId: actor.userId,
    taskId: null,
    habitId: null,
    kind: "focus",
    mode: "pomodoro",
    state: "active",
    startedAt,
    pausedAt: null,
    accumulatedActiveSeconds: 0,
    plannedSeconds: 1_500,
    endedAt: null,
    version: 1,
    createdAt: startedAt,
    updatedAt: startedAt,
    ...overrides,
  };
}
