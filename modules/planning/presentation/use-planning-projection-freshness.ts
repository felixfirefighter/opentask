"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Temporal } from "temporal-polyfill";

type ProjectionFreshnessOptions = Readonly<{
  projectedLocalDate: string;
  timeZone: string;
}>;

type PendingDateChange = Readonly<{
  boundaryKey: string;
  localDate: string;
  localDateLabel: string;
}>;

const TIMER_SETTLE_MILLISECONDS = 50;

export function usePlanningProjectionFreshness({ projectedLocalDate, timeZone }: ProjectionFreshnessOptions) {
  const router = useRouter();
  const requestedBoundary = useRef("");
  const confirmedBoundary = useRef("");
  const [pendingDateChange, setPendingDateChange] = useState<PendingDateChange | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const refreshIfBoundaryChanged = useCallback(
    (force = false) => {
      const currentLocalDate = localDateAt(Date.now(), timeZone);
      if (!force && currentLocalDate === projectedLocalDate) return false;

      const boundaryKey = `${timeZone}:${currentLocalDate}`;
      if (!force && requestedBoundary.current === boundaryKey) return true;

      requestedBoundary.current = boundaryKey;
      confirmedBoundary.current = "";
      const localDateLabel = formatLocalDate(currentLocalDate);
      setPendingDateChange({ boundaryKey, localDate: currentLocalDate, localDateLabel });
      setAnnouncement(`The local date changed to ${localDateLabel}. Refreshing planning tasks.`);
      router.refresh();
      return true;
    },
    [projectedLocalDate, router, timeZone],
  );

  useEffect(() => {
    const currentLocalDate = localDateAt(Date.now(), timeZone);
    if (currentLocalDate === projectedLocalDate) {
      requestedBoundary.current = "";
      const currentBoundary = `${timeZone}:${projectedLocalDate}`;
      if (pendingDateChange) {
        const caughtUp =
          pendingDateChange.boundaryKey === currentBoundary &&
          pendingDateChange.localDate === projectedLocalDate;
        confirmedBoundary.current = caughtUp ? currentBoundary : "";
      } else if (confirmedBoundary.current && confirmedBoundary.current !== currentBoundary) {
        confirmedBoundary.current = "";
      }
    } else {
      refreshIfBoundaryChanged();
    }
  }, [pendingDateChange, projectedLocalDate, refreshIfBoundaryChanged, timeZone]);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => refreshIfBoundaryChanged(),
      millisecondsUntilNextLocalDate(Date.now(), timeZone) + TIMER_SETTLE_MILLISECONDS,
    );
    const refreshAfterMissedBoundary = () => {
      requestedBoundary.current = "";
      refreshIfBoundaryChanged();
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshAfterMissedBoundary();
    };

    window.addEventListener("focus", refreshAfterMissedBoundary);
    window.addEventListener("online", refreshAfterMissedBoundary);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("focus", refreshAfterMissedBoundary);
      window.removeEventListener("online", refreshAfterMissedBoundary);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [projectedLocalDate, refreshIfBoundaryChanged, timeZone]);

  const projectedBoundary = `${timeZone}:${projectedLocalDate}`;
  const pendingMatchesTimeZone = pendingDateChange?.boundaryKey.startsWith(`${timeZone}:`) ?? false;
  const pendingWasConfirmed =
    pendingDateChange?.boundaryKey === projectedBoundary &&
    pendingDateChange.localDate === projectedLocalDate;

  return {
    announcement: pendingWasConfirmed
      ? `Planning tasks refreshed for ${pendingDateChange.localDateLabel}.`
      : pendingMatchesTimeZone
        ? announcement
        : "",
    pendingLocalDateLabel:
      pendingMatchesTimeZone && !pendingWasConfirmed ? (pendingDateChange?.localDateLabel ?? null) : null,
    refresh: () => refreshIfBoundaryChanged(true),
  } as const;
}

export function localDateAt(epochMilliseconds: number, timeZone: string) {
  return Temporal.Instant.fromEpochMilliseconds(epochMilliseconds)
    .toZonedDateTimeISO(timeZone)
    .toPlainDate()
    .toString();
}

export function millisecondsUntilNextLocalDate(epochMilliseconds: number, timeZone: string) {
  const now = Temporal.Instant.fromEpochMilliseconds(epochMilliseconds).toZonedDateTimeISO(timeZone);
  const nextMidnight = now.toPlainDate().add({ days: 1 }).toZonedDateTime(timeZone);
  return Number(nextMidnight.epochMilliseconds - now.epochMilliseconds);
}

function formatLocalDate(localDate: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${localDate}T00:00:00.000Z`));
}
