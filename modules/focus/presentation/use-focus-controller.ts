"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useOnlineStatus } from "@/shared/presentation";

import type { FocusHistoryPage, FocusSummary, FocusTimerSnapshot } from "../application/contracts";
import {
  FocusActiveReadRecoveryError,
  focusActiveView,
  buildFocusStartRequest,
  focusHistoryMutationFailure,
  focusMutationFailure,
} from "./focus-controller-policy";
import { refreshCompletedFocusReads, setActiveSnapshot } from "./data/focus-query-cache";
import {
  useCorrectFocusMutation,
  useDeleteFocusMutation,
  useDiscardFocusMutation,
  useStartFocusMutation,
  useTransitionFocusMutation,
} from "./data/use-focus-mutations";
import {
  useActiveFocusQuery,
  useFocusHistoryQuery,
  useFocusLinkSearchQuery,
  useFocusSummaryQuery,
} from "./data/use-focus-queries";
import { isFocusApiError } from "./data/focus-api-request";
import type { FocusConditionMarker } from "./focus-controller-policy";
import type {
  FocusCorrectionView,
  FocusLinkSearchView,
  FocusLinkView,
  FocusModeView,
  FocusPendingAction,
  FocusPresentationActions,
} from "./focus-screen-model";
import { BREAK_UI_DEFAULT_SECONDS, FOCUS_UI_DEFAULT_SECONDS } from "./focus-screen-model";
import { focusHistoryView, focusLinkOptions, focusSummaryView, focusTimerView } from "./focus-view-model";
import { useDebouncedValue } from "./use-debounced-value";
import { useFocusTimerProjectionSeconds } from "./use-focus-timer-projection";

type FocusRecoveryScope = "active" | "history" | "all";

export function useFocusController({
  hourCycle,
  initialActive,
  initialHistory,
  initialSummary,
  timeZone,
}: Readonly<{
  hourCycle: "h12" | "h23";
  initialActive?: FocusTimerSnapshot | null;
  initialHistory?: FocusHistoryPage;
  initialSummary?: FocusSummary;
  timeZone: string;
}>) {
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const activeQuery = useActiveFocusQuery(initialActive);
  const summaryQuery = useFocusSummaryQuery(initialSummary);
  const historyQuery = useFocusHistoryQuery(initialHistory);
  const start = useStartFocusMutation();
  const transition = useTransitionFocusMutation();
  const discard = useDiscardFocusMutation();
  const correction = useCorrectFocusMutation();
  const remove = useDeleteFocusMutation();
  const [mode, setMode] = useState<FocusModeView>("pomodoro");
  const [focusSeconds, setFocusSeconds] = useState(FOCUS_UI_DEFAULT_SECONDS);
  const [breakSeconds, setBreakSeconds] = useState(BREAK_UI_DEFAULT_SECONDS);
  const [link, setLink] = useState<FocusLinkView | null>(null);
  const [linkQuery, setLinkQuery] = useState("");
  const debouncedLinkQuery = useDebouncedValue(linkQuery, 180);
  const linksQuery = useFocusLinkSearchQuery(debouncedLinkQuery);
  const [pendingAction, setPendingAction] = useState<FocusPendingAction | null>(null);
  const [marker, setMarker] = useState<FocusConditionMarker>(null);
  const [historyMutationError, setHistoryMutationError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const startKey = useRef<Readonly<{ signature: string; id: string }> | null>(null);
  const recoveryScope = useRef<FocusRecoveryScope | null>(null);
  const historyNeedsRecovery = useRef(false);
  const previousOnline = useRef(online);

  const snapshot = activeQuery.data;
  const projectedElapsedSeconds = useFocusTimerProjectionSeconds(snapshot);

  useEffect(() => {
    const reconnecting = !previousOnline.current && online;
    previousOnline.current = online;
    if (!reconnecting) return;
    void activeQuery.refetch().then((result) => {
      if (!result.error) {
        if (result.data) startKey.current = null;
        setMarker({
          kind: "reconnect",
          message: "The timer was rebuilt from the latest authoritative server state.",
        });
        setAnnouncement("Focus timer reconnected to the server.");
      }
    });
    void summaryQuery.refetch();
    void historyQuery.refetch();
  }, [activeQuery, historyQuery, online, summaryQuery]);

  const timer = focusTimerView(
    snapshot ?? null,
    {
      mode,
      focusPlannedSeconds: focusSeconds,
      breakPlannedSeconds: breakSeconds,
      link,
    },
    projectedElapsedSeconds,
  );
  const active = focusActiveView({
    data: snapshot,
    error: activeQuery.error,
    pending: activeQuery.isPending,
    online,
    marker,
    timer,
  });
  const linkSearch: FocusLinkSearchView = {
    query: linkQuery,
    options: focusLinkOptions(linksQuery.data),
    status:
      linkQuery.trim().length === 0
        ? "idle"
        : debouncedLinkQuery !== linkQuery.trim() || linksQuery.isFetching
          ? "loading"
          : linksQuery.error
            ? "error"
            : "ready",
  };

  async function refreshAuthoritativeState(scope: FocusRecoveryScope): Promise<
    Readonly<{
      ok: boolean;
      active?: FocusTimerSnapshot | null;
    }>
  > {
    const needsActive = scope === "active" || scope === "all";
    const needsHistory = scope === "history" || scope === "all";
    const [activeResult, , historyResult] = await Promise.all([
      needsActive ? activeQuery.refetch() : Promise.resolve(null),
      needsHistory ? summaryQuery.refetch() : Promise.resolve(null),
      needsHistory ? historyQuery.refetch() : Promise.resolve(null),
    ]);
    const activeFailed = Boolean(activeResult && (activeResult.error || activeResult.data === undefined));
    const historyFailed = Boolean(historyResult && (historyResult.error || historyResult.data === undefined));
    const ok = scope === "history" ? !historyFailed : !activeFailed;
    if (!ok) return { ok: false };
    if (activeResult?.data) startKey.current = null;
    return {
      ok: true,
      ...(activeResult && activeResult.data !== undefined ? { active: activeResult.data } : {}),
    };
  }

  async function run(
    action: FocusPendingAction,
    recover: FocusRecoveryScope,
    work: () => Promise<void>,
  ): Promise<boolean> {
    if (!online || pendingAction !== null) return false;
    const historyOnly = recover === "history";
    setPendingAction(action);
    if (historyOnly) setHistoryMutationError(null);
    else setMarker(null);
    try {
      await work();
      if (historyOnly) historyNeedsRecovery.current = false;
      else recoveryScope.current = null;
      return true;
    } catch (error) {
      if (error instanceof FocusActiveReadRecoveryError) {
        recoveryScope.current = recover;
        setMarker(null);
        return false;
      }
      if (isFocusApiError(error) && error.code === "CONFLICT") {
        const refreshed = await refreshAuthoritativeState(recover);
        if (refreshed.ok) {
          if (historyOnly) {
            historyNeedsRecovery.current = false;
            setHistoryMutationError(null);
            setAnnouncement("Latest authoritative Focus history restored.");
          } else {
            recoveryScope.current = null;
            setMarker({
              kind: "conflict",
              message: "The latest authoritative Focus state was restored after a conflict.",
            });
            setAnnouncement("Latest authoritative Focus state restored.");
          }
          return false;
        }
      }
      if (historyOnly) {
        historyNeedsRecovery.current = true;
        setHistoryMutationError(focusHistoryMutationFailure(error));
      } else {
        recoveryScope.current = recover;
        setMarker(focusMutationFailure(error));
      }
      return false;
    } finally {
      setPendingAction(null);
    }
  }

  function startTimer(kind: "focus" | "break") {
    const input = buildFocusStartRequest({
      kind,
      mode,
      focusPlannedSeconds: focusSeconds,
      breakPlannedSeconds: breakSeconds,
      link,
    });
    const signature = JSON.stringify(input);
    if (startKey.current?.signature !== signature) {
      startKey.current = { signature, id: crypto.randomUUID() };
    }
    const requestKey = startKey.current.id;
    void run(kind === "focus" ? "start-focus" : "start-break", "active", async () => {
      const result = await start.mutateAsync({ resourceId: requestKey, input });
      startKey.current = null;
      if (result.snapshot.session.state === "completed") {
        refreshCompletedFocusReads(queryClient);
        const refreshed = await refreshAuthoritativeState("active");
        if (!refreshed.ok) throw new FocusActiveReadRecoveryError();
        if (refreshed.active) {
          setMarker({
            kind: "conflict",
            message: "Another authoritative timer was found after the completed start replay.",
          });
          setAnnouncement("Existing authoritative timer restored.");
        } else {
          setAnnouncement("Completed start replay confirmed; no timer is active.");
        }
        return;
      } else {
        setActiveSnapshot(queryClient, result.snapshot);
      }
      if (result.outcome === "recovered_existing") {
        setMarker({
          kind: "conflict",
          message: "Another authoritative timer was already running, so it was restored here.",
        });
        setAnnouncement("Existing authoritative timer restored.");
      } else {
        setAnnouncement(kind === "break" ? "Break timer started." : "Focus timer started.");
      }
    });
  }

  function transitionTimer(command: "pause" | "resume" | "finish") {
    if (!snapshot || snapshot.session.state === "completed") return;
    void run(command, command === "finish" ? "all" : "active", async () => {
      const updated = await transition.mutateAsync({
        command,
        sessionId: snapshot.session.id,
        input: { expectedVersion: snapshot.session.version },
      });
      if (command === "finish") {
        setActiveSnapshot(queryClient, null);
        if (updated.session.kind === "focus") refreshCompletedFocusReads(queryClient);
        setAnnouncement(updated.session.kind === "break" ? "Break finished." : "Focus session saved.");
      } else {
        setActiveSnapshot(queryClient, updated);
        const phase = updated.session.kind === "break" ? "Break" : "Focus timer";
        setAnnouncement(command === "pause" ? `${phase} paused.` : `${phase} resumed.`);
      }
    });
  }

  function discardTimer() {
    if (!snapshot || snapshot.session.state === "completed") return;
    void run("discard", "active", async () => {
      await discard.mutateAsync({
        sessionId: snapshot.session.id,
        input: { expectedVersion: snapshot.session.version },
      });
      setActiveSnapshot(queryClient, null);
      setAnnouncement("Timer discarded. No Focus time was added.");
    });
  }

  async function correctSession(sessionId: string, patch: FocusCorrectionView): Promise<boolean> {
    const item = historyQuery.data?.items.find(({ session }) => session.id === sessionId);
    if (!item) return false;
    return run("correct", "history", async () => {
      await correction.mutateAsync({
        sessionId,
        input: {
          expectedVersion: item.session.version,
          patch: {
            durationSeconds: patch.durationSeconds,
            ...(patch.link !== undefined ? { link: patch.link } : {}),
          },
        },
      });
      refreshCompletedFocusReads(queryClient);
      setAnnouncement("Focus session corrected. Totals are being refreshed.");
    });
  }

  function deleteSession(sessionId: string) {
    const item = historyQuery.data?.items.find(({ session }) => session.id === sessionId);
    if (!item) return;
    void run("delete", "history", async () => {
      await remove.mutateAsync({
        sessionId,
        input: { expectedVersion: item.session.version },
      });
      refreshCompletedFocusReads(queryClient);
      setAnnouncement("Focus session deleted. Totals are being refreshed.");
    });
  }

  const onLinkSearch = useCallback((query: string) => setLinkQuery(query), []);
  async function retryAuthoritativeState(): Promise<void> {
    const scope = recoveryScope.current;
    if (scope === null) {
      await activeQuery.refetch();
      return;
    }
    const refreshed = await refreshAuthoritativeState(scope);
    if (!refreshed.ok) return;
    recoveryScope.current = null;
    if (refreshed.active) {
      setMarker({
        kind: "conflict",
        message: "An authoritative timer was found and restored.",
      });
      setAnnouncement("Existing authoritative timer restored.");
    } else {
      setMarker(null);
      setAnnouncement("Authoritative Focus state refreshed.");
    }
  }

  async function retryHistoryState(): Promise<void> {
    if (!historyNeedsRecovery.current) {
      await historyQuery.refetch();
      return;
    }
    const refreshed = await refreshAuthoritativeState("history");
    if (!refreshed.ok) return;
    historyNeedsRecovery.current = false;
    setHistoryMutationError(null);
    setAnnouncement("Authoritative Focus history refreshed.");
  }

  const actions: FocusPresentationActions = {
    onModeChange: setMode,
    onFocusDurationChange: setFocusSeconds,
    onBreakDurationChange: setBreakSeconds,
    onLinkChange: setLink,
    onLinkSearch,
    onStartFocus: () => startTimer("focus"),
    onStartBreak: () => startTimer("break"),
    onPause: () => transitionTimer("pause"),
    onResume: () => transitionTimer("resume"),
    onFinish: () => transitionTimer("finish"),
    onDiscard: discardTimer,
    onCorrect: correctSession,
    onDelete: deleteSession,
    onRetryActive: () => void retryAuthoritativeState(),
    onRetrySummary: () => void summaryQuery.refetch(),
    onRetryHistory: () => void retryHistoryState(),
  };

  return {
    actions,
    active,
    announcement,
    history: focusHistoryView(
      historyQuery.data,
      historyQuery.isPending,
      historyQuery.error ?? historyMutationError,
      timeZone,
      hourCycle,
    ),
    linkSearch,
    pendingAction,
    summary: focusSummaryView(summaryQuery.data, summaryQuery.isPending, summaryQuery.error),
  } as const;
}
