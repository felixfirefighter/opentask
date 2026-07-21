import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database, DatabaseTransaction } from "@/shared/db/client";
import { ApplicationError } from "@/shared/http/application-error";

import {
  createFocusSessionApplication,
  type FocusSessionApplicationRepository,
} from "./focus-session-application";
import type { FocusLinkValidator, FocusLinkValidators } from "./contracts";
import type { StoredFocusSession } from "../infrastructure/focus-session-repository";

const actor: AuthenticatedActor = { userId: "10000000-0000-4000-8000-000000000001" };
const sessionId = "70000000-0000-4000-8000-000000000001";
const otherSessionId = "70000000-0000-4000-8000-000000000002";
const taskId = "20000000-0000-4000-8000-000000000001";
const habitId = "60000000-0000-4000-8000-000000000001";
const startedAt = new Date("2026-07-21T08:00:00.000Z");

describe("focus session application", () => {
  it("serializes a new start, validates its owned link, and persists the explicit duration", async () => {
    const sessions = repository();
    const links = validators();
    const app = application(sessions, links, new Date("2026-07-21T08:00:02.900Z"));

    const result = await app.startFocusSession(actor, {
      id: sessionId,
      kind: "focus",
      mode: "pomodoro",
      plannedSeconds: 1_800,
      taskId,
      habitId: null,
    });

    expect(sessions.lockStartScope).toHaveBeenCalledWith(actor.userId, transaction);
    expect(links.task.readOwned).toHaveBeenCalledWith(actor, taskId, transaction);
    expect(sessions.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: sessionId,
        userId: actor.userId,
        plannedSeconds: 1_800,
        taskId,
        now: new Date("2026-07-21T08:00:02.900Z"),
      }),
      transaction,
    );
    expect(result).toMatchObject({
      outcome: "created",
      snapshot: {
        elapsedActiveSeconds: 0,
        link: { kind: "task", id: taskId, label: "task label", availability: "available" },
        session: { plannedSeconds: 1_800, version: 1 },
      },
    });
  });

  it("replays the same ID before revalidating a now-unavailable link", async () => {
    const current = row({ taskId, state: "completed", endedAt: new Date("2026-07-21T08:25:00Z") });
    const sessions = repository({ lockById: vi.fn(async () => current) });
    const links = validators({ taskAvailable: false });

    const result = await application(sessions, links, new Date("2026-07-21T09:00:00Z")).startFocusSession(
      actor,
      {
        id: sessionId,
        kind: "focus",
        mode: "pomodoro",
        plannedSeconds: 1_500,
        taskId,
        habitId: null,
      },
    );

    expect(result).toMatchObject({
      outcome: "idempotent_retry",
      snapshot: {
        session: { state: "completed" },
        link: { kind: "task", id: taskId, label: null, availability: "unavailable" },
      },
    });
    expect(links.task.readOwned).toHaveBeenCalledTimes(1);
    expect(sessions.insert).not.toHaveBeenCalled();
  });

  it("recovers a different unfinished timer before validating the requested link", async () => {
    const existing = row({ id: otherSessionId, state: "paused", pausedAt: new Date("2026-07-21T08:05:00Z") });
    const sessions = repository({ findUnfinished: vi.fn(async () => existing) });
    const links = validators({ habitAvailable: false });

    const result = await application(sessions, links, new Date("2026-07-21T08:10:00Z")).startFocusSession(
      actor,
      {
        id: sessionId,
        kind: "focus",
        mode: "stopwatch",
        plannedSeconds: null,
        taskId: null,
        habitId,
      },
    );

    expect(result).toMatchObject({
      outcome: "recovered_existing",
      snapshot: { session: { id: otherSessionId, state: "paused" } },
    });
    expect(links.habit.readOwned).not.toHaveBeenCalled();
  });

  it("recovers the current unfinished timer instead of replaying a completed same-ID row", async () => {
    const completed = row({ state: "completed", endedAt: new Date("2026-07-21T08:25:00Z") });
    const current = row({
      id: otherSessionId,
      state: "paused",
      pausedAt: new Date("2026-07-21T08:45:00Z"),
      version: 2,
    });
    const sessions = repository({
      lockById: vi.fn(async () => completed),
      findUnfinished: vi.fn(async () => current),
    });

    const result = await application(
      sessions,
      validators(),
      new Date("2026-07-21T09:00:00Z"),
    ).startFocusSession(actor, {
      id: sessionId,
      kind: "focus",
      mode: "pomodoro",
      plannedSeconds: 1_500,
      taskId: null,
      habitId: null,
    });

    expect(sessions.findUnfinished).toHaveBeenCalledWith(actor.userId, transaction, true);
    expect(result).toMatchObject({
      outcome: "recovered_existing",
      snapshot: { session: { id: otherSessionId, state: "paused", version: 2 } },
    });
  });

  it("rejects mismatched ID reuse and an inaccessible new link without revealing ownership", async () => {
    const current = row();
    const collision = repository({ lockById: vi.fn(async () => current) });
    await expect(
      application(collision, validators(), startedAt).startFocusSession(actor, {
        id: sessionId,
        kind: "focus",
        mode: "pomodoro",
        plannedSeconds: 1_800,
        taskId: null,
        habitId: null,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 1 });

    const inaccessible = repository();
    await expect(
      application(inaccessible, validators({ taskExists: false }), startedAt).startFocusSession(actor, {
        id: sessionId,
        kind: "focus",
        mode: "pomodoro",
        plannedSeconds: 1_500,
        taskId,
        habitId: null,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(inaccessible.insert).not.toHaveBeenCalled();
  });

  it("applies pause time once and recognizes an exact one-version retry", async () => {
    const current = row();
    const paused = row({
      state: "paused",
      pausedAt: new Date("2026-07-21T08:00:12.999Z"),
      accumulatedActiveSeconds: 12,
      version: 2,
      updatedAt: new Date("2026-07-21T08:00:12.999Z"),
    });
    const sessions = repository({
      lockById: vi.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(paused),
      writeState: vi.fn(async () => paused),
    });
    const app = application(sessions, validators(), new Date("2026-07-21T08:00:12.999Z"));

    const first = await app.pauseFocusSession(actor, sessionId, { expectedVersion: 1 });
    const retry = await app.pauseFocusSession(actor, sessionId, { expectedVersion: 1 });

    expect(first).toMatchObject({ elapsedActiveSeconds: 12, session: { state: "paused", version: 2 } });
    expect(retry).toEqual(first);
    expect(sessions.writeState).toHaveBeenCalledTimes(1);
    expect(sessions.writeState).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: 1,
        value: expect.objectContaining({ accumulatedActiveSeconds: 12, state: "paused" }),
      }),
      transaction,
    );
  });

  it("rejects stale transitions and scopes missing sessions to the actor", async () => {
    const sessions = repository({ lockById: vi.fn(async () => row({ version: 3 })) });
    await expect(
      application(sessions, validators(), startedAt).finishFocusSession(actor, sessionId, {
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 3 });

    const missing = repository({ lockById: vi.fn(async () => null) });
    await expect(
      application(missing, validators(), startedAt).pauseFocusSession(actor, sessionId, {
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ApplicationError);
    expect(missing.lockById).toHaveBeenCalledWith(actor.userId, sessionId, transaction);
  });

  it("validates only a newly applied correction link and keeps exact retries idempotent", async () => {
    const current = row({
      state: "completed",
      endedAt: new Date("2026-07-21T08:25:00Z"),
      accumulatedActiveSeconds: 1_500,
    });
    const corrected = row({
      state: "completed",
      endedAt: new Date("2026-07-21T08:25:00Z"),
      accumulatedActiveSeconds: 1_800,
      taskId: null,
      habitId,
      version: 2,
      updatedAt: new Date("2026-07-21T09:00:00Z"),
    });
    const sessions = repository({
      lockById: vi.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(corrected),
      correctCompleted: vi.fn(async () => corrected),
    });
    const links = validators();
    const app = application(sessions, links, new Date("2026-07-21T09:00:00Z"));
    const request = {
      expectedVersion: 1,
      patch: { durationSeconds: 1_800, link: { kind: "habit" as const, id: habitId } },
    };

    const first = await app.correctCompletedSession(actor, sessionId, request);
    const retry = await app.correctCompletedSession(actor, sessionId, request);

    expect(first).toEqual(correctedDto());
    expect(retry).toEqual(first);
    expect(links.habit.readOwned).toHaveBeenCalledTimes(1);
    expect(sessions.correctCompleted).toHaveBeenCalledTimes(1);
  });

  it("can correct duration while retaining the same historical unavailable link", async () => {
    const current = row({
      state: "completed",
      endedAt: new Date("2026-07-21T08:25:00Z"),
      accumulatedActiveSeconds: 1_500,
      taskId,
    });
    const corrected = row({
      ...current,
      accumulatedActiveSeconds: 1_620,
      version: 2,
      updatedAt: new Date("2026-07-21T09:00:00Z"),
    });
    const sessions = repository({
      lockById: vi.fn(async () => current),
      correctCompleted: vi.fn(async () => corrected),
    });
    const links = validators({ taskAvailable: false });

    await expect(
      application(sessions, links, new Date("2026-07-21T09:00:00Z")).correctCompletedSession(
        actor,
        sessionId,
        {
          expectedVersion: 1,
          patch: { durationSeconds: 1_620, link: { kind: "task", id: taskId } },
        },
      ),
    ).resolves.toMatchObject({ accumulatedActiveSeconds: 1_620, taskId });
    expect(links.task.readOwned).not.toHaveBeenCalled();
  });

  it("discards only unfinished rows and deletes only completed focus", async () => {
    const active = row({ taskId });
    const sessions = repository({
      lockById: vi
        .fn()
        .mockResolvedValueOnce(active)
        .mockResolvedValueOnce(row({ state: "completed", endedAt: new Date("2026-07-21T08:25:00Z") })),
      remove: vi.fn(async ({ lifecycle }) =>
        lifecycle === "unfinished"
          ? active
          : row({ state: "completed", endedAt: new Date("2026-07-21T08:25:00Z") }),
      ),
    });
    const app = application(sessions, validators(), new Date("2026-07-21T08:00:09.999Z"));
    await expect(app.discardFocusSession(actor, sessionId, { expectedVersion: 1 })).resolves.toMatchObject({
      state: "active",
    });
    await expect(app.deleteCompletedSession(actor, sessionId, { expectedVersion: 1 })).resolves.toMatchObject(
      { state: "completed" },
    );
    expect(sessions.remove).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ lifecycle: "unfinished" }),
      transaction,
    );
    expect(sessions.remove).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ lifecycle: "completed-focus" }),
      transaction,
    );
  });
});

const transaction = {} as DatabaseTransaction;

function database(): Database {
  return {
    transaction: vi.fn(async (work: (value: DatabaseTransaction) => Promise<unknown>) => work(transaction)),
  } as unknown as Database;
}

function application(sessions: FocusSessionApplicationRepository, links: FocusLinkValidators, now: Date) {
  return createFocusSessionApplication({
    database: database(),
    clock: { now: vi.fn(() => new Date(now)) },
    links,
    sessions,
  });
}

function repository(
  overrides: Partial<FocusSessionApplicationRepository> = {},
): FocusSessionApplicationRepository {
  return {
    lockStartScope: vi.fn(async () => undefined),
    lockById: vi.fn(async () => null),
    findUnfinished: vi.fn(async () => null),
    insert: vi.fn(async (input) =>
      row({
        id: input.id,
        userId: input.userId,
        taskId: input.taskId,
        habitId: input.habitId,
        kind: input.kind,
        mode: input.mode,
        plannedSeconds: input.plannedSeconds,
        startedAt: input.now,
        createdAt: input.now,
        updatedAt: input.now,
      }),
    ),
    writeState: vi.fn(async () => null),
    correctCompleted: vi.fn(async () => null),
    remove: vi.fn(async () => null),
    ...overrides,
  };
}

function validators(
  options: Readonly<{
    taskExists?: boolean;
    taskAvailable?: boolean;
    habitExists?: boolean;
    habitAvailable?: boolean;
  }> = {},
): FocusLinkValidators {
  return {
    task: validator("task", taskId, options.taskExists ?? true, options.taskAvailable ?? true),
    habit: validator("habit", habitId, options.habitExists ?? true, options.habitAvailable ?? true),
  };
}

function validator(
  kind: "task" | "habit",
  expectedId: string,
  exists: boolean,
  available: boolean,
): FocusLinkValidator {
  const owned = (id: string) =>
    exists && id === expectedId ? { kind, id, label: available ? `${kind} label` : null, available } : null;
  return {
    kind,
    readOwned: vi.fn(async (_actor, id) => owned(id)),
    readOwnedMany: vi.fn(async (_actor, ids) => ids.flatMap((id: string) => owned(id) ?? [])),
    searchOwned: vi.fn(async () => {
      const value = owned(expectedId);
      return value ? [value] : [];
    }),
  };
}

function row(overrides: Partial<StoredFocusSession> = {}): StoredFocusSession {
  return {
    id: sessionId,
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

function correctedDto() {
  return expect.objectContaining({
    state: "completed",
    accumulatedActiveSeconds: 1_800,
    taskId: null,
    habitId,
    version: 2,
  });
}
