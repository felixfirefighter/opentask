import type * as FocusModule from "@/modules/focus";
import { ApplicationError } from "@/shared/http/application-error";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  correctCompletedSession: vi.fn(),
  deleteCompletedSession: vi.fn(),
  discardFocusSession: vi.fn(),
  finishFocusSession: vi.fn(),
  getActiveFocusSession: vi.fn(),
  getFocusApplication: vi.fn(),
  getFocusSummary: vi.fn(),
  listRecentFocusSessions: vi.fn(),
  pauseFocusSession: vi.fn(),
  resolveActor: vi.fn(),
  resumeFocusSession: vi.fn(),
  searchFocusLinks: vi.fn(),
  startFocusSession: vi.fn(),
}));

vi.mock("@/modules/identity", () => ({
  getIdentityRequestSecurity: () => ({ trustedOrigin: "http://localhost:3000" }),
  resolveActor: mocks.resolveActor,
}));

vi.mock("@/modules/focus", async (importOriginal) => ({
  ...(await importOriginal<typeof FocusModule>()),
  getFocusApplication: mocks.getFocusApplication,
}));

import { GET as getActive } from "./active/route";
import { GET as searchLinks } from "./links/route";
import { DELETE as deleteSession, PATCH as correctSession } from "./sessions/[sessionId]/route";
import { POST as discardSession } from "./sessions/[sessionId]/discard/route";
import { POST as finishSession } from "./sessions/[sessionId]/finish/route";
import { POST as pauseSession } from "./sessions/[sessionId]/pause/route";
import { POST as resumeSession } from "./sessions/[sessionId]/resume/route";
import { GET as getHistory, POST as startSession } from "./sessions/route";
import { GET as getSummary } from "./summary/route";

const actor = { userId: "10000000-0000-4000-8000-000000000001" };
const sessionId = "20000000-0000-4000-8000-000000000001";
const taskId = "30000000-0000-4000-8000-000000000001";

describe("focus API read routes", () => {
  beforeEach(prepareMocks);

  it("returns private actor-scoped active, summary, history, and link projections", async () => {
    mocks.getActiveFocusSession.mockResolvedValue({ session: { id: sessionId } });
    mocks.getFocusSummary.mockResolvedValue({ todaySeconds: 1_200 });
    mocks.listRecentFocusSessions.mockResolvedValue({ items: [], nextCursor: null });
    mocks.searchFocusLinks.mockResolvedValue([
      { kind: "task", id: taskId, label: "Ship demo", available: true },
    ]);

    const responses = await Promise.all([
      getActive(getRequest("/api/v1/focus/active")),
      getSummary(getRequest("/api/v1/focus/summary")),
      getHistory(getRequest("/api/v1/focus/sessions?limit=10&cursor=current_page")),
      searchLinks(getRequest("/api/v1/focus/links?q=%20ship%20&limit=8")),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([200, 200, 200, 200]);
    for (const response of responses) expectPrivate(response);
    expect(mocks.getActiveFocusSession).toHaveBeenCalledWith(actor);
    expect(mocks.getFocusSummary).toHaveBeenCalledWith(actor);
    expect(mocks.listRecentFocusSessions).toHaveBeenCalledWith(actor, {
      limit: 10,
      cursor: "current_page",
    });
    expect(mocks.searchFocusLinks).toHaveBeenCalledWith(actor, { q: "ship", limit: 8 });
  });

  it("applies the bounded history default and rejects duplicate or unknown query parameters", async () => {
    mocks.listRecentFocusSessions.mockResolvedValue({ items: [], nextCursor: null });
    const defaultResponse = await getHistory(getRequest("/api/v1/focus/sessions"));
    expect(defaultResponse.status).toBe(200);
    expect(mocks.listRecentFocusSessions).toHaveBeenCalledWith(actor, { limit: 20 });

    for (const path of [
      "/api/v1/focus/sessions?limit=10&limit=20",
      "/api/v1/focus/sessions?unexpected=1",
      "/api/v1/focus/sessions?limit=51",
      "/api/v1/focus/active?unexpected=1",
      "/api/v1/focus/summary?unexpected=1",
    ]) {
      const response = path.includes("active")
        ? await getActive(getRequest(path))
        : path.includes("summary")
          ? await getSummary(getRequest(path))
          : await getHistory(getRequest(path));
      await expectProblem(response, 400, "VALIDATION_FAILED");
    }
    expect(mocks.listRecentFocusSessions).toHaveBeenCalledTimes(1);
  });

  it("requires q and limit once and enforces the canonical link search bounds", async () => {
    for (const query of [
      "limit=10",
      "q=ship",
      "q=ship&q=demo&limit=10",
      "q=ship&limit=10&unexpected=1",
      "q=ship&limit=0",
      "q=ship&limit=21",
      `q=${"x".repeat(121)}&limit=10`,
    ]) {
      const response = await searchLinks(getRequest(`/api/v1/focus/links?${query}`));
      await expectProblem(response, 400, "VALIDATION_FAILED");
    }
    expect(mocks.searchFocusLinks).not.toHaveBeenCalled();
  });

  it("authenticates before parsing a read query and returns a private safe problem", async () => {
    mocks.resolveActor.mockRejectedValueOnce(
      Object.assign(new Error("sensitive session detail"), { code: "UNAUTHENTICATED" }),
    );
    const response = await searchLinks(getRequest("/api/v1/focus/links?unexpected=sensitive"));

    await expectProblem(response, 401, "UNAUTHENTICATED");
    await expect(response.clone().json()).resolves.not.toMatchObject({ detail: "sensitive session detail" });
    expect(mocks.searchFocusLinks).not.toHaveBeenCalled();
  });
});

describe("focus API mutation routes", () => {
  beforeEach(prepareMocks);

  it("uses the UUIDv4 Idempotency-Key as the sole session ID and returns 201 only for creation", async () => {
    mocks.startFocusSession.mockResolvedValue(startResult("created", sessionId));
    const response = await startSession(
      mutationRequest(
        "/api/v1/focus/sessions",
        "POST",
        {
          kind: "focus",
          mode: "pomodoro",
          plannedSeconds: 1_500,
          taskId,
        },
        { "idempotency-key": sessionId.toUpperCase() },
      ),
    );

    expect(response.status).toBe(201);
    expectPrivate(response);
    expect(response.headers.get("location")).toBe(`/api/v1/focus/sessions/${sessionId}`);
    expect(mocks.startFocusSession).toHaveBeenCalledWith(actor, {
      id: sessionId,
      kind: "focus",
      mode: "pomodoro",
      plannedSeconds: 1_500,
      taskId,
      habitId: null,
    });

    for (const outcome of ["idempotent_retry", "recovered_existing"] as const) {
      mocks.startFocusSession.mockResolvedValueOnce(startResult(outcome, sessionId));
      const replay = await startSession(
        mutationRequest(
          "/api/v1/focus/sessions",
          "POST",
          { kind: "focus", mode: "stopwatch" },
          { "idempotency-key": sessionId },
        ),
      );
      expect(replay.status).toBe(200);
      expect(replay.headers.has("location")).toBe(false);
      expectPrivate(replay);
    }
  });

  it("dispatches pause, resume, finish, discard, correction, and deletion with optimistic versions", async () => {
    const transitionInput = { expectedVersion: 4 };
    const transitionRoutes = [
      [pauseSession, mocks.pauseFocusSession],
      [resumeSession, mocks.resumeFocusSession],
      [finishSession, mocks.finishFocusSession],
      [discardSession, mocks.discardFocusSession],
    ] as const;

    for (const [route, application] of transitionRoutes) {
      const response = await route(
        mutationRequest(`/api/v1/focus/sessions/${sessionId}`, "POST", transitionInput),
        sessionContext(),
      );
      expect(response.status).toBe(200);
      expectPrivate(response);
      expect(application).toHaveBeenCalledWith(actor, sessionId, transitionInput);
    }

    const correctionInput = {
      expectedVersion: 5,
      patch: { durationSeconds: 1_800, link: { kind: "task", id: taskId } },
    };
    const correction = await correctSession(
      mutationRequest(`/api/v1/focus/sessions/${sessionId}`, "PATCH", correctionInput),
      sessionContext(),
    );
    expect(correction.status).toBe(200);
    expectPrivate(correction);
    expect(mocks.correctCompletedSession).toHaveBeenCalledWith(actor, sessionId, correctionInput);

    const deletion = await deleteSession(
      mutationRequest(`/api/v1/focus/sessions/${sessionId}`, "DELETE", {
        expectedVersion: 6,
      }),
      sessionContext(),
    );
    expect(deletion.status).toBe(200);
    expectPrivate(deletion);
    expect(mocks.deleteCompletedSession).toHaveBeenCalledWith(actor, sessionId, {
      expectedVersion: 6,
    });
  });

  it("checks the trusted JSON origin for every write before application dispatch", async () => {
    const cases = [
      {
        invoke: () =>
          startSession(
            mutationRequest(
              "/api/v1/focus/sessions",
              "POST",
              { kind: "focus", mode: "stopwatch" },
              { "idempotency-key": sessionId },
              "https://attacker.invalid",
            ),
          ),
        application: mocks.startFocusSession,
      },
      ...transitionMutationCases("https://attacker.invalid"),
      {
        invoke: () =>
          correctSession(
            mutationRequest(
              `/api/v1/focus/sessions/${sessionId}`,
              "PATCH",
              { expectedVersion: 1, patch: { durationSeconds: 60 } },
              {},
              "https://attacker.invalid",
            ),
            sessionContext(),
          ),
        application: mocks.correctCompletedSession,
      },
      {
        invoke: () =>
          deleteSession(
            mutationRequest(
              `/api/v1/focus/sessions/${sessionId}`,
              "DELETE",
              { expectedVersion: 1 },
              {},
              "https://attacker.invalid",
            ),
            sessionContext(),
          ),
        application: mocks.deleteCompletedSession,
      },
    ];

    for (const testCase of cases) {
      const response = await testCase.invoke();
      await expectProblem(response, 403, "FORBIDDEN");
      expect(testCase.application).not.toHaveBeenCalled();
    }
  });

  it("rejects a body session ID, missing or invalid create key, client clocks, and oversized bodies", async () => {
    const invalidRequests = [
      mutationRequest(
        "/api/v1/focus/sessions",
        "POST",
        { id: sessionId, kind: "focus", mode: "stopwatch" },
        { "idempotency-key": sessionId },
      ),
      mutationRequest("/api/v1/focus/sessions", "POST", {
        kind: "focus",
        mode: "stopwatch",
      }),
      mutationRequest(
        "/api/v1/focus/sessions",
        "POST",
        { kind: "focus", mode: "stopwatch" },
        { "idempotency-key": "not-a-uuid" },
      ),
      mutationRequest(
        "/api/v1/focus/sessions",
        "POST",
        { kind: "focus", mode: "stopwatch", startedAt: "2026-07-21T00:00:00Z" },
        { "idempotency-key": sessionId },
      ),
      mutationRequest(
        "/api/v1/focus/sessions",
        "POST",
        { kind: "focus", mode: "stopwatch", padding: "x".repeat(4_096) },
        { "idempotency-key": sessionId },
      ),
    ];

    for (const request of invalidRequests) {
      await expectProblem(await startSession(request), 400, "VALIDATION_FAILED");
    }
    expect(mocks.startFocusSession).not.toHaveBeenCalled();
  });

  it("rejects malformed mutation bodies, unexpected query params, and missing JSON content type", async () => {
    const badVersion = await pauseSession(
      mutationRequest(`/api/v1/focus/sessions/${sessionId}`, "POST", { expectedVersion: 0 }),
      sessionContext(),
    );
    await expectProblem(badVersion, 400, "VALIDATION_FAILED");

    const unexpectedQuery = await finishSession(
      mutationRequest(`/api/v1/focus/sessions/${sessionId}?unexpected=1`, "POST", { expectedVersion: 1 }),
      sessionContext(),
    );
    await expectProblem(unexpectedQuery, 400, "VALIDATION_FAILED");

    const nonJson = await discardSession(
      new Request(`http://localhost:3000/api/v1/focus/sessions/${sessionId}/discard`, {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "text/plain" },
        body: JSON.stringify({ expectedVersion: 1 }),
      }),
      sessionContext(),
    );
    await expectProblem(nonJson, 400, "VALIDATION_FAILED");

    expect(mocks.pauseFocusSession).not.toHaveBeenCalled();
    expect(mocks.finishFocusSession).not.toHaveBeenCalled();
    expect(mocks.discardFocusSession).not.toHaveBeenCalled();
  });

  it("maps owner-safe application errors and preserves conflict version metadata", async () => {
    mocks.pauseFocusSession.mockRejectedValueOnce(
      new ApplicationError("NOT_FOUND", "The focus session was not found."),
    );
    const missing = await pauseSession(
      mutationRequest(`/api/v1/focus/sessions/${sessionId}/pause`, "POST", {
        expectedVersion: 1,
      }),
      sessionContext(),
    );
    await expectProblem(missing, 404, "NOT_FOUND");

    mocks.resumeFocusSession.mockRejectedValueOnce(
      new ApplicationError("CONFLICT", "The focus session changed.", { currentVersion: 7 }),
    );
    const conflict = await resumeSession(
      mutationRequest(`/api/v1/focus/sessions/${sessionId}/resume`, "POST", {
        expectedVersion: 1,
      }),
      sessionContext(),
    );
    await expectProblem(conflict, 409, "CONFLICT");
    await expect(conflict.clone().json()).resolves.toMatchObject({ currentVersion: 7 });
  });

  it("requires an authenticated actor before parsing or dispatching a mutation", async () => {
    mocks.resolveActor.mockRejectedValueOnce(
      Object.assign(new Error("sensitive session detail"), { code: "UNAUTHENTICATED" }),
    );
    const response = await startSession(
      mutationRequest(
        "/api/v1/focus/sessions?unexpected=sensitive",
        "POST",
        { kind: "focus", mode: "stopwatch" },
        { "idempotency-key": sessionId },
      ),
    );

    await expectProblem(response, 401, "UNAUTHENTICATED");
    await expect(response.clone().json()).resolves.toMatchObject({ detail: "Sign in to continue." });
    expect(mocks.startFocusSession).not.toHaveBeenCalled();
  });
});

function prepareMocks(): void {
  vi.clearAllMocks();
  mocks.resolveActor.mockResolvedValue(actor);
  mocks.getFocusApplication.mockReturnValue({
    correctCompletedSession: mocks.correctCompletedSession,
    deleteCompletedSession: mocks.deleteCompletedSession,
    discardFocusSession: mocks.discardFocusSession,
    finishFocusSession: mocks.finishFocusSession,
    getActiveFocusSession: mocks.getActiveFocusSession,
    getFocusSummary: mocks.getFocusSummary,
    listRecentFocusSessions: mocks.listRecentFocusSessions,
    pauseFocusSession: mocks.pauseFocusSession,
    resumeFocusSession: mocks.resumeFocusSession,
    searchFocusLinks: mocks.searchFocusLinks,
    startFocusSession: mocks.startFocusSession,
  });
  for (const mutation of [
    mocks.correctCompletedSession,
    mocks.deleteCompletedSession,
    mocks.discardFocusSession,
    mocks.finishFocusSession,
    mocks.pauseFocusSession,
    mocks.resumeFocusSession,
  ]) {
    mutation.mockResolvedValue({ id: sessionId });
  }
}

function transitionMutationCases(origin: string) {
  return [
    {
      invoke: () =>
        pauseSession(
          mutationRequest(
            `/api/v1/focus/sessions/${sessionId}/pause`,
            "POST",
            { expectedVersion: 1 },
            {},
            origin,
          ),
          sessionContext(),
        ),
      application: mocks.pauseFocusSession,
    },
    {
      invoke: () =>
        resumeSession(
          mutationRequest(
            `/api/v1/focus/sessions/${sessionId}/resume`,
            "POST",
            { expectedVersion: 1 },
            {},
            origin,
          ),
          sessionContext(),
        ),
      application: mocks.resumeFocusSession,
    },
    {
      invoke: () =>
        finishSession(
          mutationRequest(
            `/api/v1/focus/sessions/${sessionId}/finish`,
            "POST",
            { expectedVersion: 1 },
            {},
            origin,
          ),
          sessionContext(),
        ),
      application: mocks.finishFocusSession,
    },
    {
      invoke: () =>
        discardSession(
          mutationRequest(
            `/api/v1/focus/sessions/${sessionId}/discard`,
            "POST",
            { expectedVersion: 1 },
            {},
            origin,
          ),
          sessionContext(),
        ),
      application: mocks.discardFocusSession,
    },
  ];
}

function getRequest(path: string): Request {
  return new Request(`http://localhost:3000${path}`);
}

function mutationRequest(
  path: string,
  method: "DELETE" | "PATCH" | "POST",
  body: unknown,
  headers: Record<string, string> = {},
  origin = "http://localhost:3000",
): Request {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin,
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function sessionContext() {
  return { params: Promise.resolve({ sessionId }) };
}

function startResult(outcome: "created" | "idempotent_retry" | "recovered_existing", id: string) {
  return { outcome, snapshot: { session: { id } } };
}

function expectPrivate(response: Response): void {
  expect(response.headers.get("cache-control")).toBe("no-store");
}

async function expectProblem(response: Response, status: number, code: string): Promise<void> {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toContain("application/problem+json");
  expectPrivate(response);
  await expect(response.clone().json()).resolves.toMatchObject({ code });
}
