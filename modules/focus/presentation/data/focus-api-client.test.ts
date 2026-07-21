import { afterEach, describe, expect, it, vi } from "vitest";

import {
  correctCompletedFocusSession,
  deleteCompletedFocusSession,
  listRecentFocusSessions,
  pauseFocusSession,
  searchFocusLinks,
  startFocusSession,
} from "./focus-api-client";

const SESSION_ID = "4f1d5586-9766-4d54-9a05-ad65421052b3";
const TASK_ID = "6830f42a-7c5c-40a4-8a7c-cb1d6cba7a0b";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("focus API client", () => {
  it("starts through the UUID idempotency header without sending client timestamps", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ outcome: "created", snapshot: activeSnapshot() }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await startFocusSession(SESSION_ID, {
      kind: "focus",
      mode: "pomodoro",
      plannedSeconds: 1_500,
      taskId: TASK_ID,
      habitId: null,
    });

    const [path, request] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String(request?.body)) as Record<string, unknown>;
    expect(path).toBe("/api/v1/focus/sessions");
    expect(request).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(new Headers(request?.headers).get("idempotency-key")).toBe(SESSION_ID);
    expect(body).toEqual({
      kind: "focus",
      mode: "pomodoro",
      plannedSeconds: 1_500,
      taskId: TASK_ID,
      habitId: null,
    });
    expect(Object.keys(body).some((key) => /(?:at|time|elapsed)/iu.test(key))).toBe(false);
  });

  it("sends optimistic versions on transition, correction, and deletion routes", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(pausedSnapshot()))
      .mockResolvedValueOnce(Response.json(completedSession({ version: 8 })))
      .mockResolvedValueOnce(Response.json(completedSession({ version: 10 })));
    vi.stubGlobal("fetch", fetchMock);

    await pauseFocusSession(SESSION_ID, { expectedVersion: 3 });
    await correctCompletedFocusSession(SESSION_ID, {
      expectedVersion: 7,
      patch: { durationSeconds: 1_800, link: null },
    });
    await deleteCompletedFocusSession(SESSION_ID, { expectedVersion: 9 });

    expect(fetchMock.mock.calls.map(([path, request]) => [path, request?.method, request?.body])).toEqual([
      [`/api/v1/focus/sessions/${SESSION_ID}/pause`, "POST", JSON.stringify({ expectedVersion: 3 })],
      [
        `/api/v1/focus/sessions/${SESSION_ID}`,
        "PATCH",
        JSON.stringify({
          expectedVersion: 7,
          patch: { durationSeconds: 1_800, link: null },
        }),
      ],
      [`/api/v1/focus/sessions/${SESSION_ID}`, "DELETE", JSON.stringify({ expectedVersion: 9 })],
    ]);
  });

  it("uses bounded history and server-owned link-search query contracts", async () => {
    const links = [{ kind: "task", id: TASK_ID, label: "Prepare release", available: true }];
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ items: [], nextCursor: null }))
      .mockResolvedValueOnce(Response.json(links));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listRecentFocusSessions({ limit: 20, cursor: "next_page" })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    await expect(searchFocusLinks({ q: "release", limit: 20 })).resolves.toEqual(links);

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/v1/focus/sessions?cursor=next_page&limit=20",
      "/api/v1/focus/links?q=release&limit=20",
    ]);
  });
});

function activeSnapshot() {
  return {
    session: {
      id: SESSION_ID,
      kind: "focus" as const,
      mode: "pomodoro" as const,
      state: "active" as const,
      taskId: TASK_ID,
      habitId: null,
      startedAt: "2026-07-21T00:00:00.000Z",
      pausedAt: null,
      accumulatedActiveSeconds: 0,
      plannedSeconds: 1_500,
      endedAt: null,
      version: 1,
      createdAt: "2026-07-21T00:00:00.000Z",
      updatedAt: "2026-07-21T00:00:00.000Z",
    },
    link: {
      kind: "task" as const,
      id: TASK_ID,
      label: "Prepare release",
      availability: "available" as const,
    },
    authoritativeAt: "2026-07-21T00:00:00.000Z",
    elapsedActiveSeconds: 0,
    remainingSeconds: 1_500,
    overtimeSeconds: 0,
    planReached: false,
  };
}

function pausedSnapshot() {
  const snapshot = activeSnapshot();
  return {
    ...snapshot,
    session: {
      ...snapshot.session,
      state: "paused" as const,
      pausedAt: "2026-07-21T00:05:00.000Z",
      accumulatedActiveSeconds: 300,
      version: 4,
      updatedAt: "2026-07-21T00:05:00.000Z",
    },
    authoritativeAt: "2026-07-21T00:05:00.000Z",
    elapsedActiveSeconds: 300,
    remainingSeconds: 1_200,
  };
}

function completedSession(overrides: Readonly<{ version: number }>) {
  return {
    ...activeSnapshot().session,
    state: "completed" as const,
    pausedAt: null,
    accumulatedActiveSeconds: 1_500,
    endedAt: "2026-07-21T00:25:00.000Z",
    version: overrides.version,
    updatedAt: "2026-07-21T00:25:00.000Z",
  };
}
