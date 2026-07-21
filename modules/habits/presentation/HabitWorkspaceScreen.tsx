"use client";

import { Archive, Plus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/shared/presentation";

import type { HabitOverview } from "../application/contracts";
import { HabitCheckInControl } from "./HabitCheckInControl";
import { HabitConditionBanner, HabitLoadingRows, HabitPermissionState } from "./HabitCondition";
import {
  habitWriteDisabledReason,
  type HabitLifecycleView,
  type HabitScreenCondition,
} from "./habit-screen-model";
import { HabitSummaryRow } from "./HabitSummaryRow";
import styles from "./HabitWorkspaceScreen.module.css";

export function HabitWorkspaceScreen({
  condition,
  hasNextPage = false,
  lifecycle,
  loadingMore = false,
  loadMoreError = null,
  loadMoreRecovery = "retry",
  onCreate,
  onLoadMore,
  onRetry,
  overviews,
}: Readonly<{
  condition: HabitScreenCondition;
  hasNextPage?: boolean;
  lifecycle: HabitLifecycleView;
  loadingMore?: boolean;
  loadMoreError?: string | null;
  loadMoreRecovery?: "retry" | "restart";
  onCreate: () => void;
  onLoadMore?: () => void;
  onRetry: () => void;
  overviews: readonly HabitOverview[];
}>) {
  const readOnly = condition.kind !== "ready";
  const writeDisabledReason = habitWriteDisabledReason(condition);
  const emptyReadyWorkspace =
    lifecycle === "active" &&
    overviews.length === 0 &&
    !hasNextPage &&
    !loadingMore &&
    !loadMoreError &&
    condition.kind === "ready";
  const showContinuation = hasNextPage || loadingMore || loadMoreError !== null;
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className="eyebrow">Practice</p>
          <h1 tabIndex={-1} data-route-focus>
            Habits
          </h1>
          <p>
            {lifecycle === "active"
              ? `${overviews.length}${hasNextPage ? " loaded" : ""} active ${overviews.length === 1 ? "habit" : "habits"}`
              : "Preserved history"}
          </p>
        </div>
        {lifecycle === "active" && !emptyReadyWorkspace ? (
          <Button type="button" disabled={readOnly} onClick={onCreate}>
            <Plus size={17} aria-hidden="true" /> Create habit
          </Button>
        ) : null}
      </header>
      <nav className={styles.viewControl} aria-label="Habit view">
        <Link href="/habits?view=active" aria-current={lifecycle === "active" ? "page" : undefined}>
          Active
        </Link>
        <Link href="/habits?view=archived" aria-current={lifecycle === "archived" ? "page" : undefined}>
          Archived
        </Link>
      </nav>
      <HabitConditionBanner condition={condition} onRetry={onRetry} onReviewLatest={onRetry} />
      {condition.kind === "permission" ? (
        <HabitPermissionState />
      ) : condition.kind === "loading" && overviews.length === 0 ? (
        <HabitLoadingRows />
      ) : overviews.length === 0 && condition.kind === "error" ? (
        <section className={styles.empty} data-state="error">
          <h2>Habit definitions are unavailable</h2>
          <p>No empty-state conclusion is shown until the list can be refreshed.</p>
          <Button type="button" variant="secondary" onClick={onRetry}>
            Retry habits
          </Button>
        </section>
      ) : overviews.length === 0 && !showContinuation ? (
        <HabitEmpty
          lifecycle={lifecycle}
          onCreate={onCreate}
          disabled={readOnly}
          showCreate={emptyReadyWorkspace}
        />
      ) : (
        <section
          className={styles.list}
          aria-label={lifecycle === "active" ? "Active habits" : "Archived habits"}
        >
          {overviews.map((overview) => (
            <HabitSummaryRow
              overview={overview}
              key={overview.detail.habit.id}
              action={
                lifecycle === "active" ? (
                  <HabitCheckInControl
                    day={overview.today}
                    detail={overview.detail}
                    disabled={readOnly}
                    {...(writeDisabledReason ? { disabledReason: writeDisabledReason } : {})}
                    requiresAction={!overview.weeklyProgress?.achieved}
                  />
                ) : undefined
              }
            />
          ))}
        </section>
      )}
      {condition.kind !== "permission" && showContinuation ? (
        <div className={styles.continuation}>
          {condition.kind === "offline" ? (
            <p>Reconnect to load more habits.</p>
          ) : loadMoreError ? (
            <p role="alert">{loadMoreError}</p>
          ) : overviews.length === 0 ? (
            <p>No habits are loaded from this page yet.</p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            disabled={readOnly || loadingMore || !onLoadMore}
            onClick={onLoadMore}
          >
            {loadingMore
              ? "Loading more habits…"
              : loadMoreError
                ? loadMoreRecovery === "restart"
                  ? "Refresh habits from the beginning"
                  : "Retry loading more habits"
                : "Load more habits"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function HabitEmpty({
  lifecycle,
  onCreate,
  disabled,
  showCreate,
}: Readonly<{
  lifecycle: HabitLifecycleView;
  onCreate: () => void;
  disabled: boolean;
  showCreate: boolean;
}>) {
  if (lifecycle === "archived") {
    return (
      <section className={styles.empty}>
        <Archive size={24} aria-hidden="true" />
        <h2>No archived habits</h2>
        <p>Archived habits keep their history here. Active habits remain unchanged.</p>
        <Button asChild variant="secondary">
          <Link href="/habits?view=active">Return to active habits</Link>
        </Button>
      </section>
    );
  }
  return (
    <section className={styles.empty}>
      <h2>No habits yet</h2>
      <p>Create one clear practice. Streaks are information, not a score.</p>
      {showCreate ? (
        <Button type="button" disabled={disabled} onClick={onCreate}>
          Create habit
        </Button>
      ) : null}
    </section>
  );
}
