"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Temporal } from "temporal-polyfill";

import { habitQueryKeys } from "./data/habit-query-keys";

export type HabitFreshnessBoundary = Readonly<{ timezone: string; localDate: string }>;

const TIMER_SETTLE_MILLISECONDS = 50;
const RECOVERY_RETRY_THROTTLE_MILLISECONDS = 1_000;

export function useHabitProjectionFreshness(boundaries: readonly HabitFreshnessBoundary[]) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const normalized = useMemo(() => normalizeBoundaries(boundaries), [boundaries]);
  const refreshPending = useRef(false);
  const lastRefreshAttempt = useRef<number | null>(null);
  const lastRefreshAttemptWasOffline = useRef(false);
  const [announcement, setAnnouncement] = useState("");

  const refreshIfStale = useCallback(() => {
    if (!boundariesAreStale(normalized, Date.now())) return false;
    const attemptAt = performance.now();
    const online = navigator.onLine;
    const recoveredFromOffline = lastRefreshAttemptWasOffline.current && online;
    if (
      lastRefreshAttempt.current !== null &&
      attemptAt - lastRefreshAttempt.current < RECOVERY_RETRY_THROTTLE_MILLISECONDS &&
      !recoveredFromOffline
    ) {
      return true;
    }

    lastRefreshAttempt.current = attemptAt;
    lastRefreshAttemptWasOffline.current = !online;
    refreshPending.current = true;
    setAnnouncement("Habit dates changed. Refreshing habit views.");
    void queryClient.invalidateQueries({ queryKey: habitQueryKeys.all });
    router.refresh();
    return true;
  }, [normalized, queryClient, router]);

  const checkFreshness = useCallback(() => {
    if (boundariesAreStale(normalized, Date.now())) return refreshIfStale();
    if (refreshPending.current) {
      refreshPending.current = false;
      lastRefreshAttempt.current = null;
      lastRefreshAttemptWasOffline.current = false;
      setAnnouncement("Habit dates refreshed.");
    }
    return false;
  }, [normalized, refreshIfStale]);

  useEffect(() => {
    checkFreshness();
  }, [checkFreshness]);

  useEffect(() => {
    if (normalized.length === 0) return;
    const timeout = window.setTimeout(
      checkFreshness,
      millisecondsUntilEarliestLocalMidnight(Date.now(), normalized) + TIMER_SETTLE_MILLISECONDS,
    );
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") checkFreshness();
    };

    window.addEventListener("focus", checkFreshness);
    window.addEventListener("online", checkFreshness);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("focus", checkFreshness);
      window.removeEventListener("online", checkFreshness);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [checkFreshness, normalized]);

  return { announcement } as const;
}

export function localDateAt(epochMilliseconds: number, timezone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(epochMilliseconds)
    .toZonedDateTimeISO(timezone)
    .toPlainDate()
    .toString();
}

export function millisecondsUntilNextLocalMidnight(epochMilliseconds: number, timezone: string): number {
  const now = Temporal.Instant.fromEpochMilliseconds(epochMilliseconds).toZonedDateTimeISO(timezone);
  const nextMidnight = now.toPlainDate().add({ days: 1 }).toZonedDateTime(timezone);
  return Number(nextMidnight.epochMilliseconds - now.epochMilliseconds);
}

export function millisecondsUntilEarliestLocalMidnight(
  epochMilliseconds: number,
  boundaries: readonly HabitFreshnessBoundary[],
): number {
  return Math.min(
    ...normalizeBoundaries(boundaries).map(({ timezone }) =>
      millisecondsUntilNextLocalMidnight(epochMilliseconds, timezone),
    ),
  );
}

function boundariesAreStale(boundaries: readonly HabitFreshnessBoundary[], epochMilliseconds: number) {
  return boundaries.some(({ timezone, localDate }) => localDateAt(epochMilliseconds, timezone) !== localDate);
}

function normalizeBoundaries(
  boundaries: readonly HabitFreshnessBoundary[],
): readonly HabitFreshnessBoundary[] {
  return [
    ...new Map(
      boundaries.map((boundary) => [`${boundary.timezone}:${boundary.localDate}`, boundary]),
    ).values(),
  ].sort((left, right) =>
    left.timezone === right.timezone
      ? left.localDate.localeCompare(right.localDate)
      : left.timezone.localeCompare(right.timezone),
  );
}
