import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  FocusHistoryPage,
  FocusSessionDto,
  FocusSummary,
  FocusTimerSnapshot,
} from "../application/contracts";
import { FocusApiError } from "./data/focus-api-request";
import { focusQueryKeys } from "./data/focus-query-keys";
import { focusWritesDisabled } from "./focus-screen-model";
import { useFocusController } from "./use-focus-controller";

const mocks = vi.hoisted(() => ({
  online: true,
  markWorkspaceRoutesStale: vi.fn(),
  getActiveFocusSession: vi.fn(),
  getFocusSummary: vi.fn(),
  listRecentFocusSessions: vi.fn(),
  searchFocusLinks: vi.fn(),
  startFocusSession: vi.fn(),
  pauseFocusSession: vi.fn(),
  resumeFocusSession: vi.fn(),
  finishFocusSession: vi.fn(),
  discardFocusSession: vi.fn(),
  correctCompletedFocusSession: vi.fn(),
  deleteCompletedFocusSession: vi.fn(),
}));

vi.mock("@/shared/presentation", () => ({
  markWorkspaceRoutesStale: mocks.markWorkspaceRoutesStale,
  useOnlineStatus: () => mocks.online,
}));

vi.mock("./data/focus-api-client", () => ({
  getActiveFocusSession: mocks.getActiveFocusSession,
  getFocusSummary: mocks.getFocusSummary,
  listRecentFocusSessions: mocks.listRecentFocusSessions,
  searchFocusLinks: mocks.searchFocusLinks,
  startFocusSession: mocks.startFocusSession,
  pauseFocusSession: mocks.pauseFocusSession,
  resumeFocusSession: mocks.resumeFocusSession,
  finishFocusSession: mocks.finishFocusSession,
  discardFocusSession: mocks.discardFocusSession,
  correctCompletedFocusSession: mocks.correctCompletedFocusSession,
  deleteCompletedFocusSession: mocks.deleteCompletedFocusSession,
}));

const SESSION_ID = "323b28cf-c8c2-41d6-846b-bb59d696b47c";
const RECOVERED_SESSION_ID = "d386f2c5-bb68-46b4-a144-aa4fbf0b382e";
const START_ID = "46e81d62-0757-47aa-ae92-f6af611b118f";
const NEXT_START_ID = "beb4c7a8-ae30-486c-b87d-8eb53aa4f135";
const TASK_ID = "aa5ce352-c6f8-4c42-a748-a70570e5b42c";
const HABIT_ID = "ae748ca8-c9c6-4a1e-894f-6d3341033361";
const HISTORY_ID = "e6172837-9a31-4a5e-a89f-688c832a3563";
const OTHER_HISTORY_ID = "b8ad3914-41bd-4db6-baa2-8931a70ac5c7";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.online = true;
  mocks.getActiveFocusSession.mockResolvedValue(null);
  mocks.getFocusSummary.mockResolvedValue(summaryFixture());
  mocks.listRecentFocusSessions.mockResolvedValue(historyFixture());
  mocks.searchFocusLinks.mockResolvedValue([]);
  mocks.startFocusSession.mockResolvedValue({ outcome: "created", snapshot: activeSnapshot() });
  mocks.pauseFocusSession.mockResolvedValue(pausedSnapshot());
  mocks.resumeFocusSession.mockResolvedValue(activeSnapshot({ version: 5 }));
  mocks.finishFocusSession.mockResolvedValue(completedSnapshot({ version: 6 }));
  mocks.discardFocusSession.mockResolvedValue(activeSnapshot().session);
  mocks.correctCompletedFocusSession.mockResolvedValue(completedSession({ version: 8 }));
  mocks.deleteCompletedFocusSession.mockResolvedValue(completedSession({ version: 10 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useFocusController", () => {
  it("reuses one UUID and exact timestamp-free start payload after an uncertain null recovery", async () => {
    const randomUUID = vi.fn(() => START_ID);
    vi.stubGlobal("crypto", { randomUUID });
    mocks.startFocusSession
      .mockRejectedValueOnce(new TypeError("response lost"))
      .mockResolvedValueOnce({ outcome: "created", snapshot: activeSnapshot({ id: START_ID }) });
    const view = renderController();

    act(() => view.result.current.actions.onStartFocus());
    await waitFor(() => expect(view.result.current.active.kind).toBe("mutation-error"));

    act(() => view.result.current.actions.onRetryActive());
    await waitFor(() => expect(view.result.current.active.kind).toBe("ready"));
    act(() => view.result.current.actions.onStartFocus());
    await waitFor(() => expect(mocks.startFocusSession).toHaveBeenCalledTimes(2));

    expect(mocks.startFocusSession.mock.calls[1]).toEqual(mocks.startFocusSession.mock.calls[0]);
    const [resourceId, input] = mocks.startFocusSession.mock.calls[0] ?? [];
    expect(resourceId).toBe(START_ID);
    expect(input).toEqual({
      kind: "focus",
      mode: "pomodoro",
      plannedSeconds: 1_500,
      taskId: null,
      habitId: null,
    });
    expect(Object.keys(input as object).some((key) => /(?:at|time|elapsed)/iu.test(key))).toBe(false);
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("clears an uncertain start key when refresh recovers an authoritative session", async () => {
    const randomUUID = vi.fn().mockReturnValueOnce(START_ID).mockReturnValueOnce(NEXT_START_ID);
    vi.stubGlobal("crypto", { randomUUID });
    const recovered = activeSnapshot({ id: RECOVERED_SESSION_ID, version: 4 });
    mocks.startFocusSession
      .mockRejectedValueOnce(new TypeError("response lost"))
      .mockResolvedValueOnce({ outcome: "created", snapshot: activeSnapshot({ id: NEXT_START_ID }) });
    mocks.getActiveFocusSession.mockResolvedValue(recovered);
    const view = renderController();

    act(() => view.result.current.actions.onStartFocus());
    await waitFor(() => expect(view.result.current.active.kind).toBe("mutation-error"));
    act(() => view.result.current.actions.onRetryActive());
    await waitFor(() => expect(view.result.current.active.kind).toBe("conflict"));
    expect(view.client.getQueryData(focusQueryKeys.active())).toEqual(recovered);

    act(() => view.result.current.actions.onDiscard());
    await waitFor(() => expect(view.client.getQueryData(focusQueryKeys.active())).toBeNull());
    act(() => view.result.current.actions.onStartFocus());
    await waitFor(() => expect(mocks.startFocusSession).toHaveBeenCalledTimes(2));

    expect(mocks.startFocusSession.mock.calls[1]?.[0]).toBe(NEXT_START_ID);
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });

  it("uses each authoritative version and replaces the active cache across pause, resume, and finish", async () => {
    const initial = activeSnapshot({ version: 3 });
    const paused = pausedSnapshot({ version: 4 });
    const resumed = activeSnapshot({ version: 5, accumulatedActiveSeconds: 300 });
    const completed = completedSnapshot({ version: 6, accumulatedActiveSeconds: 600 });
    mocks.pauseFocusSession.mockResolvedValue(paused);
    mocks.resumeFocusSession.mockResolvedValue(resumed);
    mocks.finishFocusSession.mockResolvedValue(completed);
    const view = renderController({ initialActive: initial });

    act(() => view.result.current.actions.onPause());
    await waitFor(() => expect(view.client.getQueryData(focusQueryKeys.active())).toEqual(paused));
    expect(mocks.pauseFocusSession).toHaveBeenCalledWith(SESSION_ID, { expectedVersion: 3 });

    act(() => view.result.current.actions.onResume());
    await waitFor(() => expect(view.client.getQueryData(focusQueryKeys.active())).toEqual(resumed));
    expect(mocks.resumeFocusSession).toHaveBeenCalledWith(SESSION_ID, { expectedVersion: 4 });

    act(() => view.result.current.actions.onFinish());
    await waitFor(() => expect(view.client.getQueryData(focusQueryKeys.active())).toBeNull());
    expect(mocks.finishFocusSession).toHaveBeenCalledWith(SESSION_ID, { expectedVersion: 5 });
    expect(view.result.current.announcement).toBe("Focus session saved.");
  });

  it("marks a recovered-existing start while trusting its authoritative snapshot", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => START_ID });
    const recovered = activeSnapshot({ id: RECOVERED_SESSION_ID, version: 9 });
    mocks.startFocusSession.mockResolvedValue({ outcome: "recovered_existing", snapshot: recovered });
    const view = renderController();

    act(() => view.result.current.actions.onStartFocus());
    await waitFor(() => expect(view.result.current.active.kind).toBe("conflict"));

    expect(view.client.getQueryData(focusQueryKeys.active())).toEqual(recovered);
    expect(view.result.current.announcement).toBe("Existing authoritative timer restored.");
  });

  it("refetches active state after a completed idempotent start replay and restores a different timer", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => START_ID });
    const recovered = activeSnapshot({ id: RECOVERED_SESSION_ID, version: 9 });
    mocks.startFocusSession.mockResolvedValue({
      outcome: "idempotent_retry",
      snapshot: completedSnapshot({ id: START_ID }),
    });
    mocks.getActiveFocusSession.mockResolvedValue(recovered);
    const view = renderController();

    act(() => view.result.current.actions.onStartFocus());
    await waitFor(() => expect(view.result.current.active.kind).toBe("conflict"));

    expect(mocks.getActiveFocusSession).toHaveBeenCalledOnce();
    expect(view.client.getQueryData(focusQueryKeys.active())).toEqual(recovered);
    expect(view.result.current.announcement).toBe("Existing authoritative timer restored.");
  });

  it("does not expose idle writes when active recovery after a completed start replay fails", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => START_ID });
    mocks.startFocusSession.mockResolvedValue({
      outcome: "idempotent_retry",
      snapshot: completedSnapshot({ id: START_ID }),
    });
    mocks.getActiveFocusSession.mockRejectedValue(new TypeError("active lookup failed"));
    const view = renderController();

    act(() => view.result.current.actions.onStartFocus());
    await waitFor(() => expect(view.result.current.active.kind).toBe("read-stale"));

    expect(view.client.getQueryData(focusQueryKeys.active())).toBeNull();
    expect(focusWritesDisabled(view.result.current.active)).toBe(true);
    expect(view.result.current.announcement).toBeNull();
  });

  it("keeps every mutation inert while the last authoritative projection is offline", () => {
    mocks.online = false;
    vi.stubGlobal("crypto", { randomUUID: () => START_ID });
    const view = renderController({ initialHistory: historyFixture([completedHistoryItem()]) });

    expect(view.result.current.active.kind).toBe("offline");
    expect(focusWritesDisabled(view.result.current.active)).toBe(true);
    act(() => {
      view.result.current.actions.onStartFocus();
      view.result.current.actions.onCorrect(HISTORY_ID, { durationSeconds: 1_800 });
      view.result.current.actions.onDelete(HISTORY_ID);
    });

    expect(mocks.startFocusSession).not.toHaveBeenCalled();
    expect(mocks.correctCompletedFocusSession).not.toHaveBeenCalled();
    expect(mocks.deleteCompletedFocusSession).not.toHaveBeenCalled();
  });

  it("keeps the timer ready when only the independent history read fails", async () => {
    mocks.listRecentFocusSessions.mockRejectedValue(new TypeError("history offline"));
    const view = renderController({ omitInitialHistory: true });

    await waitFor(() => expect(view.result.current.history.kind).toBe("error"));
    expect(view.result.current.active.kind).toBe("ready");
    expect(focusWritesDisabled(view.result.current.active)).toBe(false);
    expect(view.result.current.summary.kind).toBe("ready");
  });

  it("distinguishes a failed cached active read from an unconfirmed timer mutation", async () => {
    const cached = activeSnapshot({ accumulatedActiveSeconds: 300, version: 3 });
    mocks.getActiveFocusSession.mockRejectedValue(new TypeError("active refresh offline"));
    const view = renderController({ initialActive: cached });

    act(() => view.result.current.actions.onRetryActive());
    await waitFor(() => expect(view.result.current.active.kind).toBe("read-stale"));

    expect(view.result.current.active).toMatchObject({
      kind: "read-stale",
      timer: { kind: "session", id: SESSION_ID },
    });
    expect(focusWritesDisabled(view.result.current.active)).toBe(true);
  });

  it("exposes a failed summary refresh with its cached totals and retry state", async () => {
    mocks.getFocusSummary.mockRejectedValue(new TypeError("summary offline"));
    const view = renderController();

    act(() => view.result.current.actions.onRetrySummary());
    await waitFor(() => expect(view.result.current.summary.kind).toBe("error"));

    expect(view.result.current.summary).toMatchObject({
      kind: "error",
      cached: { todaySeconds: 1_500, sevenDaySeconds: 1_500 },
    });
    expect(view.result.current.active.kind).toBe("ready");
  });

  it("uses row versions for correction/deletion and invalidates history plus totals", async () => {
    const client = createQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const history = historyFixture([
      completedHistoryItem({ id: HISTORY_ID, version: 7 }),
      completedHistoryItem({ id: OTHER_HISTORY_ID, version: 9, endedAt: "2026-07-20T23:00:00.000Z" }),
    ]);
    mocks.listRecentFocusSessions.mockResolvedValue(history);
    const view = renderController({ initialHistory: history }, client);

    act(() => {
      void view.result.current.actions.onCorrect(HISTORY_ID, {
        durationSeconds: 1_800,
        link: { kind: "habit", id: HABIT_ID },
      });
    });
    await waitFor(() => expect(mocks.correctCompletedFocusSession).toHaveBeenCalledOnce());
    expect(mocks.correctCompletedFocusSession).toHaveBeenCalledWith(HISTORY_ID, {
      expectedVersion: 7,
      patch: { durationSeconds: 1_800, link: { kind: "habit", id: HABIT_ID } },
    });
    await waitFor(() => expect(view.result.current.pendingAction).toBeNull());

    act(() => view.result.current.actions.onDelete(OTHER_HISTORY_ID));
    await waitFor(() => expect(mocks.deleteCompletedFocusSession).toHaveBeenCalledOnce());
    expect(mocks.deleteCompletedFocusSession).toHaveBeenCalledWith(OTHER_HISTORY_ID, {
      expectedVersion: 9,
    });

    await waitFor(() => {
      const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
      expect(keys.filter((key) => key?.[1] === "summary")).toHaveLength(2);
      expect(keys.filter((key) => key?.[1] === "history")).toHaveLength(2);
    });
  });

  it("scopes uncertain correction and deletion recovery to history without disabling the timer", async () => {
    const history = historyFixture([completedHistoryItem({ id: HISTORY_ID, version: 7 })]);
    mocks.listRecentFocusSessions.mockResolvedValue(history);
    mocks.correctCompletedFocusSession.mockRejectedValueOnce(new TypeError("correction response lost"));
    mocks.deleteCompletedFocusSession.mockRejectedValueOnce(new TypeError("deletion response lost"));
    const view = renderController({ initialHistory: history });

    let correctionConfirmed = true;
    await act(async () => {
      correctionConfirmed = await view.result.current.actions.onCorrect(HISTORY_ID, {
        durationSeconds: 1_800,
      });
    });
    expect(correctionConfirmed).toBe(false);
    expect(view.result.current.active.kind).toBe("ready");
    expect(focusWritesDisabled(view.result.current.active)).toBe(false);
    expect(view.result.current.history).toMatchObject({
      kind: "error",
      title: "History change was not confirmed",
      items: [expect.objectContaining({ id: HISTORY_ID })],
    });

    act(() => view.result.current.actions.onRetryHistory());
    await waitFor(() => expect(view.result.current.history.kind).toBe("ready"));
    expect(mocks.getActiveFocusSession).not.toHaveBeenCalled();
    expect(mocks.getFocusSummary).toHaveBeenCalledOnce();

    act(() => view.result.current.actions.onDelete(HISTORY_ID));
    await waitFor(() => expect(view.result.current.history.kind).toBe("error"));
    expect(view.result.current.active.kind).toBe("ready");
    expect(focusWritesDisabled(view.result.current.active)).toBe(false);

    act(() => view.result.current.actions.onRetryHistory());
    await waitFor(() => expect(view.result.current.history.kind).toBe("ready"));
    expect(mocks.getActiveFocusSession).not.toHaveBeenCalled();
    expect(mocks.getFocusSummary).toHaveBeenCalledTimes(2);
  });

  it("announces pause and resume using the authoritative break phase", async () => {
    const activeBreak = breakSnapshot({ state: "active", version: 3 });
    const pausedBreak = breakSnapshot({ state: "paused", version: 4 });
    const resumedBreak = breakSnapshot({ state: "active", version: 5 });
    mocks.pauseFocusSession.mockResolvedValue(pausedBreak);
    mocks.resumeFocusSession.mockResolvedValue(resumedBreak);
    const view = renderController({ initialActive: activeBreak });

    act(() => view.result.current.actions.onPause());
    await waitFor(() => expect(view.result.current.announcement).toBe("Break paused."));

    act(() => view.result.current.actions.onResume());
    await waitFor(() => expect(view.result.current.announcement).toBe("Break resumed."));
  });

  it("recovers authoritative history even when the independent totals refresh fails", async () => {
    const history = historyFixture([completedHistoryItem({ id: HISTORY_ID, version: 7 })]);
    mocks.correctCompletedFocusSession.mockRejectedValue(new TypeError("correction response lost"));
    mocks.listRecentFocusSessions.mockResolvedValue(history);
    mocks.getFocusSummary.mockRejectedValue(new TypeError("summary refresh failed"));
    const view = renderController({ initialHistory: history });

    await act(async () => {
      await view.result.current.actions.onCorrect(HISTORY_ID, { durationSeconds: 1_800 });
    });
    expect(view.result.current.history.kind).toBe("error");

    act(() => view.result.current.actions.onRetryHistory());
    await waitFor(() => expect(view.result.current.history.kind).toBe("ready"));

    expect(view.result.current.summary).toMatchObject({
      kind: "error",
      cached: { todaySeconds: 1_500, sevenDaySeconds: 1_500 },
    });
    expect(view.result.current.active.kind).toBe("ready");
    expect(focusWritesDisabled(view.result.current.active)).toBe(false);
  });

  it("debounces server link search and exposes only available owned results", async () => {
    mocks.searchFocusLinks.mockResolvedValue([
      { kind: "task", id: TASK_ID, label: "Prepare release", available: true },
      { kind: "habit", id: HABIT_ID, label: null, available: false },
    ]);
    const view = renderController();

    act(() => view.result.current.actions.onLinkSearch("  release  "));
    expect(view.result.current.linkSearch.status).toBe("loading");
    await waitFor(() => expect(mocks.searchFocusLinks).toHaveBeenCalledWith({ q: "release", limit: 20 }));
    await waitFor(() => expect(view.result.current.linkSearch.status).toBe("ready"));

    expect(view.result.current.linkSearch.options).toEqual([
      { kind: "task", id: TASK_ID, label: "Prepare release", available: true },
    ]);
  });

  it("keeps writes disabled until a stale transition conflict can refetch active state", async () => {
    const stale = activeSnapshot({ version: 3 });
    const current = pausedSnapshot({ version: 4 });
    mocks.pauseFocusSession.mockRejectedValue(
      new FocusApiError({ code: "CONFLICT", status: 409, detail: "stale" }),
    );
    mocks.getActiveFocusSession
      .mockRejectedValueOnce(new TypeError("refresh failed"))
      .mockResolvedValueOnce(current);
    const view = renderController({ initialActive: stale });

    act(() => view.result.current.actions.onPause());
    await waitFor(() => expect(view.result.current.active.kind).toBe("mutation-error"));
    expect(focusWritesDisabled(view.result.current.active)).toBe(true);
    expect(view.client.getQueryData(focusQueryKeys.active())).toEqual(stale);

    act(() => view.result.current.actions.onRetryActive());
    await waitFor(() => expect(view.result.current.active.kind).toBe("conflict"));
    expect(view.client.getQueryData(focusQueryKeys.active())).toEqual(current);
    expect(focusWritesDisabled(view.result.current.active)).toBe(false);
  });

  it("restores the active timer after a finish conflict even when secondary reads fail", async () => {
    const stale = activeSnapshot({ version: 3 });
    const current = pausedSnapshot({ version: 4 });
    mocks.finishFocusSession.mockRejectedValue(
      new FocusApiError({ code: "CONFLICT", status: 409, detail: "stale" }),
    );
    mocks.getActiveFocusSession.mockResolvedValue(current);
    mocks.getFocusSummary.mockRejectedValue(new TypeError("summary refresh failed"));
    mocks.listRecentFocusSessions.mockRejectedValue(new TypeError("history refresh failed"));
    const view = renderController({ initialActive: stale });

    act(() => view.result.current.actions.onFinish());
    await waitFor(() => expect(view.result.current.active.kind).toBe("conflict"));

    expect(view.client.getQueryData(focusQueryKeys.active())).toEqual(current);
    expect(focusWritesDisabled(view.result.current.active)).toBe(false);
    expect(view.result.current.summary).toMatchObject({
      kind: "error",
      cached: { todaySeconds: 1_500, sevenDaySeconds: 1_500 },
    });
    expect(view.result.current.history).toMatchObject({ kind: "error" });
  });

  it("keeps correction conflict recovery scoped to history and leaves the timer usable", async () => {
    const stale = completedHistoryItem({ version: 7 });
    const current = completedHistoryItem({ version: 8, accumulatedActiveSeconds: 1_800 });
    mocks.correctCompletedFocusSession.mockRejectedValue(
      new FocusApiError({ code: "CONFLICT", status: 409, detail: "stale" }),
    );
    mocks.listRecentFocusSessions.mockResolvedValue(historyFixture([current]));
    const view = renderController({ initialHistory: historyFixture([stale]) });

    act(() => {
      void view.result.current.actions.onCorrect(HISTORY_ID, { durationSeconds: 1_800 });
    });
    await waitFor(() =>
      expect(view.result.current.announcement).toBe("Latest authoritative Focus history restored."),
    );

    expect(mocks.listRecentFocusSessions).toHaveBeenCalledWith({ limit: 20 });
    expect(mocks.getFocusSummary).toHaveBeenCalledOnce();
    expect(mocks.getActiveFocusSession).not.toHaveBeenCalled();
    expect(view.result.current.history).toMatchObject({
      kind: "ready",
      items: [expect.objectContaining({ id: HISTORY_ID, version: 8, durationSeconds: 1_800 })],
    });
    expect(view.result.current.active.kind).toBe("ready");
    expect(focusWritesDisabled(view.result.current.active)).toBe(false);
  });
});

function renderController(
  overrides: Partial<Parameters<typeof useFocusController>[0]> & {
    omitInitialHistory?: boolean;
  } = {},
  client = createQueryClient(),
) {
  const { omitInitialHistory, ...controllerOverrides } = overrides;
  const props = {
    hourCycle: "h23" as const,
    initialActive: null,
    ...(omitInitialHistory ? {} : { initialHistory: historyFixture() }),
    initialSummary: summaryFixture(),
    timeZone: "Asia/Singapore",
    ...controllerOverrides,
  };
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { ...renderHook(() => useFocusController(props), { wrapper }), client };
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { gcTime: Infinity, retry: false, staleTime: Infinity },
    },
  });
}

function activeSnapshot(
  overrides: Readonly<{
    accumulatedActiveSeconds?: number;
    id?: string;
    version?: number;
  }> = {},
): FocusTimerSnapshot {
  const accumulated = overrides.accumulatedActiveSeconds ?? 0;
  return {
    session: {
      id: overrides.id ?? SESSION_ID,
      kind: "focus",
      mode: "pomodoro",
      state: "active",
      taskId: null,
      habitId: null,
      startedAt: "2026-07-21T00:00:00.000Z",
      pausedAt: null,
      accumulatedActiveSeconds: accumulated,
      plannedSeconds: 1_500,
      endedAt: null,
      version: overrides.version ?? 3,
      createdAt: "2026-07-21T00:00:00.000Z",
      updatedAt: "2026-07-21T00:00:00.000Z",
    },
    link: null,
    authoritativeAt: "2026-07-21T00:00:00.000Z",
    elapsedActiveSeconds: accumulated,
    remainingSeconds: 1_500 - accumulated,
    overtimeSeconds: 0,
    planReached: false,
  };
}

function pausedSnapshot(overrides: Readonly<{ version?: number }> = {}): FocusTimerSnapshot {
  return {
    ...activeSnapshot({ accumulatedActiveSeconds: 300, version: overrides.version ?? 4 }),
    session: {
      ...activeSnapshot({ accumulatedActiveSeconds: 300, version: overrides.version ?? 4 }).session,
      state: "paused",
      pausedAt: "2026-07-21T00:05:00.000Z",
      updatedAt: "2026-07-21T00:05:00.000Z",
    },
    authoritativeAt: "2026-07-21T00:05:00.000Z",
  };
}

function completedSnapshot(
  overrides: Readonly<{ accumulatedActiveSeconds?: number; id?: string; version?: number }> = {},
): FocusTimerSnapshot {
  const accumulated = overrides.accumulatedActiveSeconds ?? 1_500;
  return {
    ...activeSnapshot({
      accumulatedActiveSeconds: accumulated,
      ...(overrides.id ? { id: overrides.id } : {}),
      version: overrides.version ?? 6,
    }),
    session: completedSession({
      accumulatedActiveSeconds: accumulated,
      ...(overrides.id ? { id: overrides.id } : {}),
      version: overrides.version ?? 6,
    }),
    authoritativeAt: "2026-07-21T00:25:00.000Z",
    elapsedActiveSeconds: accumulated,
    remainingSeconds: Math.max(1_500 - accumulated, 0),
    overtimeSeconds: Math.max(accumulated - 1_500, 0),
    planReached: accumulated >= 1_500,
  };
}

function breakSnapshot({
  state,
  version,
}: Readonly<{ state: "active" | "paused"; version: number }>): FocusTimerSnapshot {
  const base = activeSnapshot({ accumulatedActiveSeconds: 60, version });
  return {
    ...base,
    session: {
      ...base.session,
      kind: "break",
      mode: "pomodoro",
      state,
      plannedSeconds: 300,
      pausedAt: state === "paused" ? base.authoritativeAt : null,
    },
    remainingSeconds: 240,
  };
}

function completedSession(
  overrides: Readonly<{
    accumulatedActiveSeconds?: number;
    endedAt?: string;
    id?: string;
    version?: number;
  }> = {},
): FocusSessionDto {
  return {
    ...activeSnapshot().session,
    id: overrides.id ?? HISTORY_ID,
    state: "completed",
    accumulatedActiveSeconds: overrides.accumulatedActiveSeconds ?? 1_500,
    endedAt: overrides.endedAt ?? "2026-07-21T00:25:00.000Z",
    version: overrides.version ?? 7,
    updatedAt: overrides.endedAt ?? "2026-07-21T00:25:00.000Z",
  };
}

function completedHistoryItem(
  overrides: Readonly<{
    accumulatedActiveSeconds?: number;
    endedAt?: string;
    id?: string;
    version?: number;
  }> = {},
): FocusHistoryPage["items"][number] {
  return { session: completedSession(overrides), link: null };
}

function historyFixture(items: FocusHistoryPage["items"] = []): FocusHistoryPage {
  return { items, nextCursor: null };
}

function summaryFixture(): FocusSummary {
  const days = [
    "2026-07-15",
    "2026-07-16",
    "2026-07-17",
    "2026-07-18",
    "2026-07-19",
    "2026-07-20",
    "2026-07-21",
  ].map((localDate) => ({ localDate, totalSeconds: localDate === "2026-07-21" ? 1_500 : 0 }));
  return {
    timezone: "Asia/Singapore",
    todayLocalDate: "2026-07-21",
    todaySeconds: 1_500,
    sevenDaySeconds: 1_500,
    days,
  };
}
