"use client";

import { Check, Circle, Flag, RotateCcw } from "lucide-react";
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
  const statusLabel = restore ? `Restore ${task.title}` : `Complete ${task.title}`;

  function openTask(event: MouseEvent<HTMLAnchorElement>) {
    if (!actions.onOmplish) return;
    event.preventDefault();
    actions.onOmplish(task.id);
  }

  return (
    <article
      className={styles.row}
      data-accent={task.category ?? "slate"}
      data-conflict={task.conflicted || undefined}
      data-status={task.status}
      data-ui="planning-task-row"
    >
      <button
        type="button"
        className={styles.status}
        aria-label={statusLabel}
        disabled={disabled || !actions.onStatusChange}
        title={
          disabled
            ? (disabledReason ?? "Task changes are unavailable.")
            : actions.onStatusChange
              ? statusLabel
              : "Task status is read-only."
        }
        onClick={() => actions.onStatusChange?.(task.id, nextStatus)}
      >
        {task.status === "completed" ? (
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

      <Link className={styles.content} href={task.detailsHref} title={task.title} onClick={openTask}>
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
