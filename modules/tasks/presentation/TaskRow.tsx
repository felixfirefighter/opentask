"use client";

import { Check, Circle, Flag, GripVertical, Repeat2, RotateCcw } from "lucide-react";
import Link from "next/link";
import type { ComponentPropsWithRef, MouseEvent } from "react";

import type { TaskListItemDto, TaskPriority, TaskStatus } from "../application/contracts";

import { TaskRowMenu } from "./TaskRowMenu";
import styles from "./TaskRow.module.css";

export type TaskRowProps = Readonly<{
  task: TaskListItemDto;
  detailsHref: string;
  selected?: boolean | undefined;
  contextLabel?: string | undefined;
  disabled?: boolean | undefined;
  dragHandleProps?: ComponentPropsWithRef<"button"> | undefined;
  onOpen?: ((event: MouseEvent<HTMLAnchorElement>) => void) | undefined;
  onStatusChange: (status: TaskStatus) => void;
  onMove?: (() => void) | undefined;
  onMoveEarlier?: (() => void) | undefined;
  onMoveLater?: (() => void) | undefined;
  onPriorityChange: (priority: TaskPriority) => void;
  onDelete: () => void;
}>;

export function TaskRow({
  contextLabel,
  detailsHref,
  disabled,
  dragHandleProps,
  onMove,
  onMoveEarlier,
  onMoveLater,
  onPriorityChange,
  onDelete,
  onOpen,
  onStatusChange,
  selected,
  task,
}: TaskRowProps) {
  const restore = task.status !== "open";
  const hasActiveRecurrence = task.recurrence?.status === "active";
  const activeRecurrence = task.status === "open" && hasActiveRecurrence;
  const tags = task.tags.slice(0, 2);
  const statusLabel = activeRecurrence
    ? `Open recurring task ${task.title}`
    : restore
      ? `Restore ${task.title}`
      : `Complete ${task.title}`;

  return (
    <div
      className={styles.row}
      data-ui="task-row"
      data-task-id={task.id}
      data-selected={selected || undefined}
      data-status={task.status}
    >
      {activeRecurrence ? (
        <Link
          className={styles.status}
          data-ui-part="status"
          aria-label={statusLabel}
          href={detailsHref}
          title={statusLabel}
        >
          <Repeat2 data-ui-part="status-indicator" aria-hidden="true" />
        </Link>
      ) : (
        <button
          type="button"
          className={styles.status}
          data-ui-part="status"
          aria-label={statusLabel}
          disabled={disabled}
          onClick={() => onStatusChange(restore ? "open" : "completed")}
          title={disabled ? "Reconnect to change task status" : statusLabel}
        >
          {task.status === "completed" ? (
            <span className={styles.statusDone} data-ui-part="status-indicator">
              <Check size={13} aria-hidden="true" />
            </span>
          ) : task.status === "cancelled" ? (
            <span className={styles.statusCancelled} data-ui-part="status-indicator">
              <RotateCcw size={13} aria-hidden="true" />
            </span>
          ) : (
            <Circle data-ui-part="status-indicator" aria-hidden="true" />
          )}
        </button>
      )}

      <Link
        className={styles.content}
        data-ui-part="content"
        href={detailsHref}
        title={task.title}
        {...(onOpen ? { onClick: onOpen } : {})}
      >
        <span className={styles.title} data-ui-part="title">
          {task.title}
        </span>
        <span className={styles.metadata} data-ui-part="metadata">
          {contextLabel && <span>{contextLabel}</span>}
          {!contextLabel && hasActiveRecurrence && <span>Repeats</span>}
          {!contextLabel && task.recurrence?.status === "ended" && <span>Repeat ended</span>}
          {task.status === "cancelled" && !contextLabel && <span>Cancelled</span>}
          {tags.map((tag) => (
            <span className={styles.tag} data-accent={tag.colorToken} data-ui-part="tag" key={tag.id}>
              {tag.name}
            </span>
          ))}
          {!contextLabel && task.status === "open" && tags.length === 0 && task.recurrence === null && (
            <span className={styles.quietMetadata}>Unscheduled</span>
          )}
        </span>
      </Link>

      <div className={styles.trailing} data-ui-part="trailing">
        {task.priority !== "none" && (
          <span
            className={styles.priority}
            data-ui-part="priority"
            data-priority={task.priority}
            role="img"
            aria-label={`${task.priority} priority`}
            title={`${task.priority} priority`}
          >
            <Flag size={15} fill="currentColor" aria-hidden="true" />
          </span>
        )}
        {dragHandleProps && (
          <button
            {...dragHandleProps}
            className={styles.dragHandle}
            type="button"
            disabled={disabled}
            aria-label={`Reorder ${task.title}`}
            title={disabled ? "Reconnect to reorder tasks" : `Reorder ${task.title}`}
          >
            <GripVertical size={17} aria-hidden="true" />
          </button>
        )}
        <TaskRowMenu
          disabled={disabled}
          restore={restore}
          task={task}
          activeRecurrence={activeRecurrence}
          onMove={onMove}
          onMoveEarlier={onMoveEarlier}
          onMoveLater={onMoveLater}
          onPriorityChange={onPriorityChange}
          onDelete={onDelete}
          onStatusChange={onStatusChange}
        />
      </div>
    </div>
  );
}
