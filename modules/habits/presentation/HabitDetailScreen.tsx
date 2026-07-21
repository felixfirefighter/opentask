"use client";

import { ChevronLeft, RotateCcw } from "lucide-react";
import Link from "next/link";

import { Button } from "@/shared/presentation";

import type { HabitMonthProjection, HabitOverview } from "../application/contracts";
import { HabitArchiveDialog } from "./HabitArchiveDialog";
import { HabitCheckInControl } from "./HabitCheckInControl";
import { HabitConditionBanner, HabitHistoryLoading, HabitPermissionState } from "./HabitCondition";
import { HabitMonthHeatMap } from "./HabitMonthHeatMap";
import { HabitSevenDayStrip } from "./HabitSevenDayStrip";
import { habitWriteDisabledReason, type HabitScreenCondition } from "./habit-screen-model";
import { habitGoalLabel, habitScheduleLabel, habitStreakLabel, monthLabel } from "./habit-view-model";
import styles from "./HabitDetailScreen.module.css";

export function HabitDetailScreen({
  condition,
  historyError,
  historyLoading,
  month,
  onEdit,
  onLifecycle,
  onNextMonth,
  onPreviousMonth,
  onRetry,
  onRetryHistory,
  overview,
  pending,
}: Readonly<{
  condition: HabitScreenCondition;
  historyError: boolean;
  historyLoading: boolean;
  month?: HabitMonthProjection;
  onEdit: () => void;
  onLifecycle: () => void;
  onNextMonth: () => void;
  onPreviousMonth: () => void;
  onRetry: () => void;
  onRetryHistory: () => void;
  overview: HabitOverview;
  pending: boolean;
}>) {
  const { detail, sevenDay, streak, today, weeklyProgress } = overview;
  const { habit, schedule } = detail;
  const archived = habit.archivedAt !== null;
  const writesDisabled = condition.kind !== "ready";
  const readOnly = archived || writesDisabled;
  const writeDisabledReason = habitWriteDisabledReason(condition);
  const unit = habit.goal.goalKind === "quantity" ? habit.goal.unit : null;

  if (condition.kind === "permission") return <HabitPermissionState page />;
  return (
    <div className={styles.page}>
      <Link className={styles.back} href={`/habits?view=${archived ? "archived" : "active"}`}>
        <ChevronLeft size={18} aria-hidden="true" /> Back to habits
      </Link>
      <header className={styles.pageHeader}>
        <div className={styles.identity} data-color={habit.colorToken}>
          <span className={styles.icon} aria-hidden="true">
            {habit.icon}
          </span>
          <div>
            <p className="eyebrow">{archived ? "Archived habit" : "Habit details"}</p>
            <div className={styles.titleLine}>
              <h1 tabIndex={-1} data-route-focus>
                {habit.title}
              </h1>
              <span className={styles.category}>{categoryLabel(habit.colorToken)}</span>
            </div>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Button type="button" variant="secondary" disabled={readOnly || pending} onClick={onEdit}>
            Edit habit
          </Button>
          {archived ? (
            <Button type="button" variant="quiet" disabled={writesDisabled || pending} onClick={onLifecycle}>
              <RotateCcw size={16} aria-hidden="true" /> Restore
            </Button>
          ) : (
            <HabitArchiveDialog
              disabled={writesDisabled}
              habitTitle={habit.title}
              onConfirm={onLifecycle}
              pending={pending}
            />
          )}
        </div>
      </header>
      <HabitConditionBanner condition={condition} onRetry={onRetry} onReviewLatest={onRetry} />
      <section className={styles.summary} aria-labelledby="habit-summary-heading">
        <div>
          <h2 id="habit-summary-heading">Current practice</h2>
          <p>{habitGoalLabel(habit.goal)}</p>
          <p>
            {habitScheduleLabel(schedule.schedule)} · {schedule.schedule.timezone}
          </p>
          <p>{habitStreakLabel(streak)}</p>
          {weeklyProgress ? (
            <p>
              {weeklyProgress.completedDays} of {weeklyProgress.targetPerWeek} successful days this week
              {weeklyProgress.achieved ? " · Achieved" : ""}
            </p>
          ) : null}
        </div>
        {!archived ? (
          <HabitCheckInControl
            day={today}
            detail={detail}
            disabled={readOnly}
            {...(writeDisabledReason ? { disabledReason: writeDisabledReason } : {})}
            requiresAction={!weeklyProgress?.achieved}
          />
        ) : null}
      </section>
      <section className={styles.recent} aria-labelledby="seven-day-heading">
        <h2 id="seven-day-heading">Last seven days</h2>
        <HabitSevenDayStrip days={sevenDay} title={habit.title} unit={unit} />
      </section>
      <section className={styles.history} aria-labelledby="habit-history-heading">
        <header>
          <div>
            <h2 id="habit-history-heading">Monthly history</h2>
            <p>{month ? monthLabel(month.yearMonth) : "Habit history"}</p>
          </div>
          <div className={styles.monthActions}>
            <Button type="button" variant="quiet" onClick={onPreviousMonth}>
              Previous month
            </Button>
            <Button type="button" variant="quiet" onClick={onNextMonth}>
              Next month
            </Button>
          </div>
        </header>
        {historyLoading && !month ? (
          <HabitHistoryLoading />
        ) : historyError && !month ? (
          <div className={styles.historyError} role="alert">
            <strong>History could not be loaded</strong>
            <span>The habit definition and current check-in remain available.</span>
            <Button type="button" variant="secondary" onClick={onRetryHistory}>
              Retry history
            </Button>
          </div>
        ) : month ? (
          <>
            {!month.days.some((day) => day.log) ? <p className={styles.noHistory}>No check-ins yet</p> : null}
            <HabitMonthHeatMap month={month} title={habit.title} unit={unit} />
            {historyError ? (
              <p className={styles.staleHistory} role="status">
                History could not be refreshed. The loaded month remains visible.
              </p>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}

function categoryLabel(token: HabitOverview["detail"]["habit"]["colorToken"]) {
  return token.charAt(0).toLocaleUpperCase() + token.slice(1);
}
