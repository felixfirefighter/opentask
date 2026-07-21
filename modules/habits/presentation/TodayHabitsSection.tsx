"use client";

import Link from "next/link";

import { Button } from "@/shared/presentation";

import type { HabitTodayRow } from "../application/contracts";
import { HabitCheckInControl } from "./HabitCheckInControl";
import { HabitConditionBanner, HabitLoadingRows, HabitPermissionState } from "./HabitCondition";
import { habitWriteDisabledReason, type HabitScreenCondition } from "./habit-screen-model";
import {
  habitDayStatusLabel,
  habitGoalLabel,
  habitScheduleLabel,
  habitStreakLabel,
} from "./habit-view-model";
import styles from "./TodayHabitsSection.module.css";

export function TodayHabitsSection({
  condition,
  hasNextPage = false,
  loadingMore = false,
  loadMoreError = null,
  loadMoreRecovery = "retry",
  onLoadMore,
  onRetry,
  rows,
}: Readonly<{
  condition: HabitScreenCondition;
  hasNextPage?: boolean;
  loadingMore?: boolean;
  loadMoreError?: string | null;
  loadMoreRecovery?: "retry" | "restart";
  onLoadMore?: () => void;
  onRetry: () => void;
  rows: readonly HabitTodayRow[];
}>) {
  const showContinuation = hasNextPage || loadingMore || loadMoreError !== null;
  if (condition.kind === "ready" && rows.length === 0 && !showContinuation) return null;
  const readOnly = condition.kind !== "ready";
  const writeDisabledReason = habitWriteDisabledReason(condition);

  return (
    <section className={styles.section} aria-labelledby="today-habits-heading">
      <header className={styles.header}>
        <div>
          <h2 id="today-habits-heading" tabIndex={-1}>
            Habits
          </h2>
          <p>
            {rows.length}
            {hasNextPage ? " loaded" : ""} scheduled {rows.length === 1 ? "practice" : "practices"}
          </p>
        </div>
        <Link href="/habits">Manage habits</Link>
      </header>
      <HabitConditionBanner condition={condition} onRetry={onRetry} onReviewLatest={onRetry} />
      {condition.kind === "permission" ? (
        <HabitPermissionState />
      ) : condition.kind === "loading" && rows.length === 0 ? (
        <HabitLoadingRows label="Loading today's habits" />
      ) : condition.kind === "error" && rows.length === 0 ? (
        <div className={styles.unavailable} role="alert">
          <strong>Today&apos;s habits are unavailable</strong>
          <span>No empty-day conclusion is shown until habits can be refreshed.</span>
        </div>
      ) : (
        <div className={styles.rows}>
          {rows.map((row) => (
            <TodayHabitRow
              disabled={readOnly}
              {...(writeDisabledReason ? { disabledReason: writeDisabledReason } : {})}
              key={row.detail.habit.id}
              row={row}
            />
          ))}
        </div>
      )}
      {condition.kind !== "permission" && showContinuation ? (
        <div className={styles.continuation}>
          {condition.kind === "offline" ? (
            <p>Reconnect to load more habits.</p>
          ) : loadMoreError ? (
            <p role="alert">{loadMoreError}</p>
          ) : rows.length === 0 ? (
            <p>No scheduled practices are loaded from this page yet.</p>
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
    </section>
  );
}

function TodayHabitRow({
  disabled,
  disabledReason,
  row,
}: Readonly<{ disabled: boolean; disabledReason?: string; row: HabitTodayRow }>) {
  const { detail, day, streak, weeklyProgress } = row;
  const { habit, schedule } = detail;
  const unit = habit.goal.goalKind === "quantity" ? habit.goal.unit : null;
  const category = habit.colorToken.charAt(0).toLocaleUpperCase() + habit.colorToken.slice(1);

  return (
    <article className={styles.row} data-color={habit.colorToken}>
      <span className={styles.icon} aria-hidden="true">
        {habit.icon}
      </span>
      <Link className={styles.details} href={`/habits/${habit.id}`}>
        <span className={styles.title}>
          <strong>{habit.title}</strong>
          <span>{category}</span>
        </span>
        <span>
          {habitGoalLabel(habit.goal)} · {habitScheduleLabel(schedule.schedule)}
        </span>
        <span>
          {weeklyProgress
            ? `${weeklyProgress.completedDays} of ${weeklyProgress.targetPerWeek} successful days${weeklyProgress.achieved ? " · Achieved" : ""}`
            : habitDayStatusLabel(day, unit)}
          {" · "}
          {habitStreakLabel(streak)}
        </span>
      </Link>
      <HabitCheckInControl
        day={day}
        detail={detail}
        disabled={disabled}
        {...(disabledReason ? { disabledReason } : {})}
        requiresAction={row.requiresAction}
      />
    </article>
  );
}
