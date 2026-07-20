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
  const readOnly = condition.kind === "offline" || condition.kind === "loading";

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>{model.localWeekdayLabel}</p>
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
          ) : condition.kind === "error" && tasks.length === 0 ? (
            <UnavailableDataState title="Today's tasks are unavailable" />
          ) : tasks.length === 0 ? (
            <section className={styles.empty} aria-labelledby="today-empty-heading">
              <h2 id="today-empty-heading">Nothing planned for today</h2>
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
                headingId="today-overdue"
                label="Overdue"
                tasks={model.overdue}
                tone="danger"
              />
              <TaskProjectionSection
                actions={props.taskActions}
                disabled={readOnly}
                headingId="today-timed"
                label="Timed"
                tasks={model.timed}
              />
              <TaskProjectionSection
                actions={props.taskActions}
                disabled={readOnly}
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
