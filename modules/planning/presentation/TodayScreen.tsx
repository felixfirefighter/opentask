"use client";

import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

import { Button } from "@/shared/presentation";

import {
  LoadingRows,
  PermissionState,
  PlanningConditionBanner,
  UnavailableDataState,
} from "./PlanningCondition";
import { PlanningQuickAdd } from "./PlanningQuickAdd";
import type {
  PlanningScreenCondition,
  PlanningTaskActions,
  QuickAddModel,
  TodayPlanningModel,
} from "./planning-screen-model";
import styles from "./ProjectionScreen.module.css";
import { TaskProjectionSection } from "./TaskProjectionSection";

export type TodayScreenProps = Readonly<{
  model: TodayPlanningModel;
  condition: PlanningScreenCondition;
  quickAdd: QuickAddModel;
  taskActions: PlanningTaskActions;
  calendarHref: string;
  upcomingHref: string;
  onQuickAddChange: (value: string) => void;
  onQuickAddSubmit: (value: string) => void;
  onEditQuickAddToken?: ((tokenId: string) => void) | undefined;
  onRemoveQuickAddToken?: ((tokenId: string) => void) | undefined;
  onRetry?: (() => void) | undefined;
  onReturnToToday?: (() => void) | undefined;
}>;

export function TodayScreen(props: TodayScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { condition, model } = props;
  const tasks = [...model.overdue, ...model.timed, ...model.anytime];
  const readOnly =
    condition.kind === "offline" ||
    condition.kind === "loading" ||
    condition.kind === "partial" ||
    condition.kind === "date-changed";
  const disabledReason =
    condition.kind === "partial"
      ? "Task changes are unavailable while this planning view is incomplete."
      : undefined;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>
            {model.localWeekdayLabel} · {model.timeZoneLabel}
          </p>
          <h1 tabIndex={-1} data-route-focus>
            Today
          </h1>
          <p className={styles.subtitle}>{model.localDateLabel}</p>
        </div>
        <Button asChild variant="secondary">
          <Link href={props.calendarHref}>
            <CalendarDays size={17} aria-hidden="true" /> Calendar
          </Link>
        </Button>
      </header>

      <PlanningConditionBanner
        condition={condition}
        onRetry={props.onRetry}
        onReturnToToday={props.onReturnToToday}
      />
      {condition.kind === "permission" ? (
        <PermissionState />
      ) : (
        <>
          <section className={styles.summary} aria-label="Today summary">
            <strong>
              {condition.kind === "loading"
                ? "Loading today's plan"
                : condition.kind === "error" && tasks.length === 0
                  ? "Today's plan is unavailable"
                  : condition.kind === "partial"
                    ? `${tasks.length} loaded ${tasks.length === 1 ? "task" : "tasks"}`
                    : model.remainingLabel}
            </strong>
            <span>Tasks follow your saved local date and schedule.</span>
          </section>
          <PlanningQuickAdd
            model={props.quickAdd}
            inputRef={inputRef}
            disabled={readOnly}
            onChange={props.onQuickAddChange}
            onSubmit={props.onQuickAddSubmit}
            onEditToken={props.onEditQuickAddToken}
            onRemoveToken={props.onRemoveQuickAddToken}
          />
          {condition.kind === "loading" ? (
            <LoadingRows />
          ) : (condition.kind === "error" || condition.kind === "partial") && tasks.length === 0 ? (
            <UnavailableDataState
              title={
                condition.kind === "partial"
                  ? "Today's task list is incomplete"
                  : "Today's tasks are unavailable"
              }
              message={
                condition.kind === "partial"
                  ? "No empty-day conclusion is shown because this bounded result may be missing tasks. Retry to refresh."
                  : undefined
              }
            />
          ) : tasks.length === 0 ? (
            <section className={styles.empty} aria-labelledby="today-empty-heading">
              <h2 id="today-empty-heading" tabIndex={-1} data-planning-recovery-focus>
                Nothing planned for today
              </h2>
              <p>Add a task above or look ahead without turning an empty day into a score.</p>
              <Button asChild variant="secondary">
                <Link href={props.upcomingHref}>Open Upcoming</Link>
              </Button>
            </section>
          ) : (
            <div className={styles.sections}>
              <TaskProjectionSection
                actions={props.taskActions}
                disabled={readOnly}
                disabledReason={disabledReason}
                headingId="today-overdue"
                label="Overdue"
                tasks={model.overdue}
                tone="danger"
              />
              <TaskProjectionSection
                actions={props.taskActions}
                disabled={readOnly}
                disabledReason={disabledReason}
                headingId="today-timed"
                label="Timed"
                tasks={model.timed}
              />
              <TaskProjectionSection
                actions={props.taskActions}
                disabled={readOnly}
                disabledReason={disabledReason}
                headingId="today-anytime"
                label="Anytime"
                tasks={model.anytime}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
