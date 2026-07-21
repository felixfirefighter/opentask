"use client";

import { useMemo, useState } from "react";

import { useOnlineStatus } from "@/shared/presentation";

import type { CreateHabitRequest, HabitMonthProjection, HabitOverview } from "../application/contracts";
import { isHabitApiError } from "./data/habit-api-request";
import {
  useHabitLifecycleMutation,
  useSetHabitScheduleMutation,
  useUpdateHabitMutation,
} from "./data/use-habit-mutations";
import { useHabitDetailQuery, useHabitMonthQuery, useHabitOverviewQuery } from "./data/use-habit-queries";
import { HabitDetailScreen } from "./HabitDetailScreen";
import { HabitEditorDialog } from "./HabitEditorDialog";
import { HabitFreshnessAnnouncement } from "./HabitFreshnessAnnouncement";
import { definitionUpdate, draftFromHabit, scheduleUpdate, type HabitFormDraft } from "./habit-form-policy";
import type { HabitScreenCondition } from "./habit-screen-model";
import { currentYearMonth } from "./habit-view-model";
import { useHabitProjectionFreshness } from "./use-habit-projection-freshness";

export function HabitDetailRouteScreen({
  initialMonth,
  initialOverview,
}: Readonly<{ initialMonth?: HabitMonthProjection; initialOverview: HabitOverview }>) {
  const online = useOnlineStatus();
  const habitId = initialOverview.detail.habit.id;
  const detailQuery = useHabitDetailQuery(habitId, initialOverview.detail);
  const overviewQuery = useHabitOverviewQuery(habitId, initialOverview);
  const [yearMonth, setYearMonth] = useState(currentYearMonth(initialOverview.localDate));
  const monthQuery = useHabitMonthQuery(habitId, yearMonth, initialMonth);
  const update = useUpdateHabitMutation();
  const schedule = useSetHabitScheduleMutation();
  const lifecycle = useHabitLifecycleMutation();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorBase, setEditorBase] = useState(initialOverview.detail);
  const detail = detailQuery.data ?? initialOverview.detail;
  const overview = useMemo(
    () => ({ ...(overviewQuery.data ?? initialOverview), detail }),
    [detail, initialOverview, overviewQuery.data],
  );
  const freshnessBoundaries = useMemo(
    () => [
      {
        timezone: overview.detail.schedule.schedule.timezone,
        localDate: overview.localDate,
      },
    ],
    [overview.detail.schedule.schedule.timezone, overview.localDate],
  );
  const freshness = useHabitProjectionFreshness(freshnessBoundaries);
  const editorDraft = useMemo(() => draftFromHabit(editorBase), [editorBase]);
  const condition = detailCondition(
    online,
    detailQuery.error ?? overviewQuery.error,
    update.error ?? schedule.error ?? lifecycle.error,
  );
  const pending = update.isPending || schedule.isPending || lifecycle.isPending;
  const editorConflict = isConflict(update.error) || isConflict(schedule.error);
  const editorWriteDisabled = condition.kind !== "ready" && condition.kind !== "conflict";

  function saveHabit(_input: CreateHabitRequest, draft: HabitFormDraft) {
    if (condition.kind !== "ready" || pending || editorConflict) return;
    void saveDefinitionAndSchedule(editorBase, draft, update.mutateAsync, schedule.mutateAsync)
      .then((saved) => {
        setEditorBase(saved);
        setEditorOpen(false);
      })
      .catch(() => undefined);
  }

  async function reviewLatest() {
    const [detailResult] = await Promise.all([detailQuery.refetch(), overviewQuery.refetch()]);
    if (detailResult.error || !detailResult.data) throw detailResult.error ?? new Error("Habit unavailable");
    update.reset();
    schedule.reset();
    lifecycle.reset();
    return detailResult.data;
  }

  async function reviewEditorLatest() {
    const latest = await reviewLatest();
    setEditorBase(latest);
    return draftFromHabit(latest);
  }

  return (
    <>
      <HabitDetailScreen
        condition={condition}
        historyError={monthQuery.isError}
        historyLoading={monthQuery.isPending}
        {...(monthQuery.data ? { month: monthQuery.data } : {})}
        onEdit={() => {
          if (condition.kind !== "ready" || pending) return;
          update.reset();
          schedule.reset();
          setEditorBase(detail);
          setEditorOpen(true);
        }}
        onLifecycle={() => {
          if (condition.kind !== "ready" || pending) return;
          void lifecycle
            .mutateAsync({
              action: detail.habit.archivedAt ? "restore" : "archive",
              habitId,
              expectedVersion: detail.habit.version,
            })
            .catch(() => undefined);
        }}
        onNextMonth={() => setYearMonth(shiftMonth(yearMonth, 1))}
        onPreviousMonth={() => setYearMonth(shiftMonth(yearMonth, -1))}
        onRetry={() => void reviewLatest().catch(() => undefined)}
        onRetryHistory={() => void monthQuery.refetch()}
        overview={overview}
        pending={pending}
      />
      <HabitEditorDialog
        conflictPendingReview={editorConflict}
        errorMessage={editorError(update.error, schedule.error)}
        fieldsDisabled={editorWriteDisabled && condition.kind !== "offline"}
        initialDraft={editorDraft}
        mode="edit"
        onOpenChange={setEditorOpen}
        onReviewLatest={reviewEditorLatest}
        onSubmit={saveHabit}
        open={editorOpen}
        pending={update.isPending || schedule.isPending}
        writeDisabled={editorWriteDisabled}
        writeDisabledReason={
          condition.kind === "offline"
            ? undefined
            : "Review or retry the latest habit data before saving. This draft remains available to close."
        }
      />
      <HabitFreshnessAnnouncement announcement={freshness.announcement} />
    </>
  );
}

async function saveDefinitionAndSchedule(
  detail: HabitOverview["detail"],
  draft: HabitFormDraft,
  update: (variables: {
    habitId: string;
    input: NonNullable<ReturnType<typeof definitionUpdate>>;
  }) => Promise<HabitOverview["detail"]>,
  setSchedule: (variables: {
    habitId: string;
    expectedVersion: number;
    schedule: ReturnType<typeof scheduleUpdate>;
  }) => Promise<HabitOverview["detail"]>,
) {
  const definitionInput = definitionUpdate(detail, draft);
  const nextSchedule = scheduleUpdate(draft);
  const scheduleChanged = JSON.stringify(detail.schedule.schedule) !== JSON.stringify(nextSchedule);
  let current = detail;
  if (definitionInput) current = await update({ habitId: detail.habit.id, input: definitionInput });
  if (scheduleChanged)
    current = await setSchedule({
      habitId: detail.habit.id,
      expectedVersion: current.habit.version,
      schedule: nextSchedule,
    });
  return current;
}

function detailCondition(online: boolean, queryError: unknown, mutationError: unknown): HabitScreenCondition {
  if (!online) return { kind: "offline" };
  const error = mutationError ?? queryError;
  if (
    isHabitApiError(error) &&
    (error.code === "UNAUTHENTICATED" || error.code === "FORBIDDEN" || error.code === "NOT_FOUND")
  )
    return { kind: "permission" };
  if (isHabitApiError(error) && error.code === "CONFLICT") {
    return {
      kind: "conflict",
      message: "Review the latest definition or local-day log before retrying.",
      ...(error.currentVersion ? { currentVersion: error.currentVersion } : {}),
    };
  }
  if (error)
    return {
      kind: "error",
      message: "Loaded habit information remains visible. The latest change was not saved.",
    };
  return { kind: "ready" };
}

function editorError(updateError: unknown, scheduleError: unknown) {
  if (isConflict(scheduleError) || isConflict(updateError)) {
    return "This habit changed elsewhere. Review latest in this form before saving again.";
  }
  if (scheduleError)
    return "Habit details may have saved, but the schedule was not saved. Review the latest version before retrying.";
  if (updateError)
    return isHabitApiError(updateError) && updateError.code === "VALIDATION_FAILED"
      ? updateError.message
      : "Habit changes were not saved. Your form values remain available.";
  return null;
}

function isConflict(error: unknown): boolean {
  return isHabitApiError(error) && error.code === "CONFLICT";
}

function shiftMonth(yearMonth: string, amount: number) {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
