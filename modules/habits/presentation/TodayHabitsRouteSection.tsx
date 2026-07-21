"use client";

import { useMemo } from "react";

import { useOnlineStatus } from "@/shared/presentation";

import type { HabitTodayBoundary, HabitTodayProjection, HabitTodayRow } from "../application/contracts";
import { isHabitApiError, isHabitInvalidPageCursorError } from "./data/habit-api-request";
import { useHabitTodayInfiniteQuery } from "./data/use-habit-queries";
import { HabitFreshnessAnnouncement } from "./HabitFreshnessAnnouncement";
import type { HabitScreenCondition } from "./habit-screen-model";
import { TodayHabitsSection } from "./TodayHabitsSection";
import { useHabitProjectionFreshness } from "./use-habit-projection-freshness";

const EMPTY_TODAY_PAGES: readonly HabitTodayProjection[] = [];

export function TodayHabitsRouteSection({
  initialProjection,
}: Readonly<{ initialProjection?: HabitTodayProjection }>) {
  const online = useOnlineStatus();
  const query = useHabitTodayInfiniteQuery(initialProjection);
  const projection = useMemo(
    () =>
      flattenTodayPages(query.data?.pages ?? (initialProjection ? [initialProjection] : EMPTY_TODAY_PAGES)),
    [initialProjection, query.data?.pages],
  );
  const { rows } = projection;
  const primaryError = query.isFetchNextPageError ? null : query.error;
  const invalidPageCursor = query.isFetchNextPageError && isHabitInvalidPageCursorError(query.error);
  const condition = todayCondition(online, query.isPending, primaryError, rows.length);
  const freshness = useHabitProjectionFreshness(projection.boundaries);

  return (
    <>
      <TodayHabitsSection
        condition={condition}
        hasNextPage={query.hasNextPage}
        loadingMore={query.isFetchingNextPage}
        loadMoreError={
          query.isFetchNextPageError
            ? invalidPageCursor
              ? "The habit list changed before the next page loaded. Loaded habits remain available."
              : "More habits could not be loaded. Loaded habits remain available."
            : null
        }
        loadMoreRecovery={invalidPageCursor ? "restart" : "retry"}
        onLoadMore={() => void (invalidPageCursor ? query.refreshFromBeginning() : query.fetchNextPage())}
        onRetry={() => void query.refetch()}
        rows={rows}
      />
      <HabitFreshnessAnnouncement announcement={freshness.announcement} />
    </>
  );
}

function flattenTodayPages(pages: readonly HabitTodayProjection[]): HabitTodayProjection {
  const rowsByHabitId = new Map<string, HabitTodayRow>();
  const boundariesByKey = new Map<string, HabitTodayBoundary>();
  for (const page of pages) {
    for (const row of page.rows) rowsByHabitId.set(row.detail.habit.id, row);
    for (const boundary of page.boundaries) {
      boundariesByKey.set(`${boundary.timezone}:${boundary.localDate}`, boundary);
    }
  }
  return {
    rows: [...rowsByHabitId.values()],
    boundaries: [...boundariesByKey.values()].sort(compareBoundaries),
    nextCursor: pages.at(-1)?.nextCursor ?? null,
  };
}

function compareBoundaries(left: HabitTodayBoundary, right: HabitTodayBoundary): number {
  if (left.timezone !== right.timezone) return left.timezone < right.timezone ? -1 : 1;
  if (left.localDate === right.localDate) return 0;
  return left.localDate < right.localDate ? -1 : 1;
}

function todayCondition(
  online: boolean,
  pending: boolean,
  error: unknown,
  rowCount: number,
): HabitScreenCondition {
  if (!online) return { kind: "offline" };
  if (pending && rowCount === 0) return { kind: "loading" };
  if (isHabitApiError(error) && (error.code === "UNAUTHENTICATED" || error.code === "FORBIDDEN")) {
    return { kind: "permission" };
  }
  if (error) {
    return {
      kind: "error",
      message:
        rowCount > 0
          ? "Loaded habits may be out of date. Check-ins remain available after a safe refresh."
          : "Today's habits could not be loaded. Nothing was changed.",
    };
  }
  return { kind: "ready" };
}
