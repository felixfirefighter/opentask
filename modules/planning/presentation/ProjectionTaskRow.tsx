"use client";

import { Check, Circle, Flag, Repeat2, RotateCcw, SkipForward } from "lucide-react";
import Link from "next/link";
import type { MouseEvent } from "react";

import type { PlanningTaskActions, PlanningTaskRowModel } from "./planning-screen-model";
import { ProjectionTaskMenu } from "./ProjectionTaskMenu";
import styles from "./ProjectionTaskRow.module.css";

export function ProjectionTaskRow({
  actions,
  disabled = false,
  disabledReason,
  task,
}: Readonly<{
  actions: PlanningTaskActions;
  disabled?: boolean | undefined;
  disabledReason?: string | undefined;
  task: PlanningTaskRowModel;
}>) {
  const restore = task.status !== "open";
  const nextStatus = restore ? "open" : "completed";
  const occurrence =
    task.projectionLifecycle === "recurring_occurrence" &&
    task.occurrenceKey !== null &&
    task.occurrenceState !== null;
  const recurrenceSummary = task.projectionLifecycle === "recurrence_summary";
  const occurrenceAction = occurrence ? (task.occurrenceState === "open" ? "complete" : "undo") : null;
  const statusLabel = recurrenceSummary
    ? `Open recurring task details for ${task.title}`
    : occurrenceAction === "undo"
      ? `Undo ${task.occurrenceState} occurrence of ${task.title}`
      : occurrenceAction === "complete"
        ? `Complete occurrence of ${task.title}`
        : restore
          ? `Restore ${task.title}`
          : `Complete ${task.title}`;
  const statusAvailable = recurrenceSummary
    ? Boolean(actions.onOpenTask)
    : occurrence
      ? Boolean(actions.onOccurrenceTransition)
      : Boolean(actions.onStatusChange);

  function openTask(event: MouseEvent<HTMLAnchorElement>) {
    if (!actions.onOpenTask) return;
    event.preventDefault();
    actions.onOpenTask(task.taskId);
  }

  return (
    <article
      className={styles.row}
      data-accent={task.category ?? "slate"}
      data-conflict={task.conflicted || undefined}
      data-planning-projection-id={task.projectionId}
      data-planning-task-id={task.taskId}
      data-projection-lifecycle={task.projectionLifecycle}
      data-occurrence-state={task.occurrenceState ?? undefined}
      data-status={task.status}
      data-ui="planning-task-row"
    >
      <button
        type="button"
        className={styles.status}
        aria-label={statusLabel}
        disabled={disabled || !statusAvailable}
        title={
          disabled
            ? (disabledReason ?? "Task changes are unavailable.")
            : statusAvailable
              ? statusLabel
              : recurrenceSummary
                ? "Recurring task details are unavailable."
                : occurrence
                  ? "Occurrence state is read-only."
                  : "Task status is read-only."
        }
        onClick={() => {
          if (recurrenceSummary) {
            actions.onOpenTask?.(task.taskId);
          } else if (occurrence && occurrenceAction && task.occurrenceKey) {
            actions.onOccurrenceTransition?.(
              task.taskId,
              task.occurrenceKey,
              occurrenceAction,
              task.projectionId,
            );
          } else {
            actions.onStatusChange?.(task.taskId, nextStatus);
          }
        }}
      >
        {recurrenceSummary ? (
          <Repeat2 size={18} aria-hidden="true" />
        ) : occurrence && task.occurrenceState === "skipped" ? (
          <span className={styles.statusSkipped}>
            <SkipForward size={13} aria-hidden="true" />
          </span>
        ) : occurrence && task.occurrenceState === "completed" ? (
          <span className={styles.statusDone}>
            <Check size={13} aria-hidden="true" />
          </span>
        ) : task.status === "completed" ? (
          <span className={styles.statusDone}>
            <Check size={13} aria-hidden="true" />
          </span>
        ) : task.status === "cancelled" ? (
          <span className={styles.statusCancelled}>
            <RotateCcw size={13} aria-hidden="true" />
          </span>
        ) : (
          <Circle size={20} aria-hidden="true" />
        )}
      </button>

      <Link
        className={styles.content}
        data-planning-task-open
        href={task.detailsHref}
        title={task.title}
        onClick={openTask}
      >
        <span className={styles.title}>{task.title}</span>
        <span className={styles.metadata}>
          <span>{task.scheduleLabel}</span>
          {task.contextLabel ? <span className={styles.context}>{task.contextLabel}</span> : null}
          {task.conflicted ? <span className={styles.conflictLabel}>Changed elsewhere</span> : null}
        </span>
      </Link>

      <div className={styles.trailing}>
        <span
          className={styles.priority}
          data-priority={task.priority}
          aria-label={`${task.priority} priority`}
          role="img"
          title={`${task.priority} priority`}
        >
          <Flag size={15} fill={task.priority === "none" ? "none" : "currentColor"} aria-hidden="true" />
        </span>
        <ProjectionTaskMenu
          actions={actions}
          disabled={disabled}
          disabledReason={disabledReason}
          task={task}
        />
      </div>
    </article>
  );
}
