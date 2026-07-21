"use client";

import { useMemo, useRef, useState } from "react";

import { useOnlineStatus } from "@/shared/presentation";

import type { CreateHabitRequest, HabitOverview, HabitOverviewPage } from "../application/contracts";
import { isHabitApiError, isHabitInvalidPageCursorError } from "./data/habit-api-request";
import { useCreateHabitMutation } from "./data/use-habit-mutations";
import { useHabitOverviewsInfiniteQuery } from "./data/use-habit-queries";
import { HabitEditorDialog } from "./HabitEditorDialog";
import { HabitFreshnessAnnouncement } from "./HabitFreshnessAnnouncement";
import { emptyHabitDraft } from "./habit-form-policy";
import type { HabitLifecycleView, HabitScreenCondition } from "./habit-screen-model";
import { HabitWorkspaceScreen } from "./HabitWorkspaceScreen";
import { useHabitProjectionFreshness } from "./use-habit-projection-freshness";

const EMPTY_PAGES: readonly HabitOverviewPage[] = [];

export function HabitWorkspaceRouteScreen({
  initialPage,
  lifecycle,
  localDate,
  timezone,
}: Readonly<{
  initialPage?: HabitOverviewPage;
  lifecycle: HabitLifecycleView;
  localDate: string;
  timezone: string;
}>) {
  const online = useOnlineStatus();
  const query = useHabitOverviewsInfiniteQuery(lifecycle, initialPage);
  const create = useCreateHabitMutation();
  const [editorOpen, setEditorOpen] = useState(false);
  const resourceId = useRef<string | null>(null);
  const initialDraft = useMemo(() => emptyHabitDraft(timezone, localDate), [localDate, timezone]);
  const overviews = useMemo(
    () => flattenOverviewPages(query.data?.pages ?? (initialPage ? [initialPage] : EMPTY_PAGES)),
    [initialPage, query.data?.pages],
  );
  const freshnessBoundaries = useMemo(
    () =>
      overviews.length > 0
        ? overviews.map((overview) => ({
            timezone: overview.detail.schedule.schedule.timezone,
            localDate: overview.localDate,
          }))
        : [{ timezone, localDate }],
    [localDate, overviews, timezone],
  );
  const freshness = useHabitProjectionFreshness(freshnessBoundaries);
  const primaryError = query.isFetchNextPageError ? null : query.error;
  const invalidPageCursor = query.isFetchNextPageError && isHabitInvalidPageCursorError(query.error);
  const condition = routeCondition(online, query.isPending, primaryError, overviews.length);
  const writesDisabled = condition.kind !== "ready";
  const uncertainOutcome = Boolean(
    create.error && (!isHabitApiError(create.error) || create.error.code === "INTERNAL"),
  );

  function createHabit(input: CreateHabitRequest) {
    if (writesDisabled || create.isPending) return;
    resourceId.current ??= crypto.randomUUID();
    void create
      .mutateAsync({ resourceId: resourceId.current, input })
      .then(() => {
        resourceId.current = null;
        setEditorOpen(false);
      })
      .catch(() => undefined);
  }

  return (
    <>
      <HabitWorkspaceScreen
        condition={condition}
        hasNextPage={query.hasNextPage}
        lifecycle={lifecycle}
        loadingMore={query.isFetchingNextPage}
        loadMoreError={
          query.isFetchNextPageError
            ? invalidPageCursor
              ? "The habit list changed before the next page loaded. Loaded habits remain available."
              : "More habits could not be loaded. Loaded habits remain available."
            : null
        }
        loadMoreRecovery={invalidPageCursor ? "restart" : "retry"}
        onCreate={() => {
          if (writesDisabled || create.isPending) return;
          create.reset();
          setEditorOpen(true);
        }}
        onLoadMore={() => void (invalidPageCursor ? query.refreshFromBeginning() : query.fetchNextPage())}
        onRetry={() => void query.refetch()}
        overviews={overviews}
      />
      <HabitEditorDialog
        errorMessage={create.error ? mutationMessage(create.error) : null}
        fieldsDisabled={uncertainOutcome}
        initialDraft={initialDraft}
        mode="create"
        onOpenChange={(open) => {
          if (!open) {
            resourceId.current = null;
            create.reset();
          }
          setEditorOpen(open);
        }}
        onSubmit={createHabit}
        open={editorOpen}
        pending={create.isPending}
        uncertainOutcome={uncertainOutcome}
        writeDisabled={writesDisabled}
        writeDisabledReason={
          condition.kind === "offline"
            ? undefined
            : "Refresh the habit list before saving. This draft remains available to review or close."
        }
      />
      <HabitFreshnessAnnouncement announcement={freshness.announcement} />
    </>
  );
}

function flattenOverviewPages(pages: readonly HabitOverviewPage[]): readonly HabitOverview[] {
  const byId = new Map<string, HabitOverview>();
  for (const page of pages) {
    for (const overview of page.items) byId.set(overview.detail.habit.id, overview);
  }
  return [...byId.values()];
}

function routeCondition(
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
          ? "Loaded habits may be out of date. Nothing was changed."
          : "Habit definitions could not be loaded. Nothing was changed.",
    };
  }
  return { kind: "ready" };
}

function mutationMessage(error: unknown) {
  if (isHabitApiError(error) && error.code === "CONFLICT") {
    return "This create request conflicts with a saved habit. Review the list before retrying.";
  }
  if (isHabitApiError(error) && error.code === "VALIDATION_FAILED") return error.message;
  return "The create outcome could not be confirmed. Retry this unchanged draft with the same safety key, or close and review the habit list before starting another.";
}
