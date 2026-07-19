"use client";

import { CalendarClock, Circle, Flag, MoreHorizontal } from "lucide-react";
import Link from "next/link";

import styles from "./TaskRow.module.css";

export type TaskRowProps = {
  title: string;
  meta: string;
  href?: string | undefined;
  priority?: "high" | "medium" | "low" | "none" | undefined;
  completed?: boolean | undefined;
  onToggle?: (() => void) | undefined;
  tag?: string | undefined;
  accent?: "coral" | "amber" | "mint" | "sky" | "violet" | "slate" | undefined;
};

export function TaskRow({
  title,
  meta,
  href = "/tasks/demo",
  priority = "none",
  completed,
  onToggle,
  tag,
  accent = "slate",
}: TaskRowProps) {
  const statusLabel = completed ? `Mark ${title} incomplete` : `Complete ${title}`;
  const moreLabel = `More actions for ${title}`;

  return (
    <div className={styles.row} data-ui="task-row" data-completed={completed || undefined}>
      <button
        type="button"
        className={styles.status}
        data-ui-part="status"
        aria-label={statusLabel}
        aria-pressed={completed}
        onClick={onToggle}
        title={statusLabel}
      >
        {completed ? (
          <span className={styles.statusDone} data-ui-part="status-indicator">
            ✓
          </span>
        ) : (
          <Circle data-ui-part="status-indicator" />
        )}
      </button>
      <Link className={styles.content} data-ui-part="content" href={href}>
        <span className={styles.title} data-ui-part="title">
          {title}
        </span>
        <span className={styles.meta} data-ui-part="metadata">
          <CalendarClock size={13} aria-hidden="true" /> {meta}
        </span>
      </Link>
      <div className={styles.trailing} data-ui-part="trailing">
        {tag && (
          <span className={styles.tag} data-ui-part="tag" data-accent={accent}>
            {tag}
          </span>
        )}
        {priority !== "none" && (
          <span
            className={styles.priority}
            data-ui-part="priority"
            data-priority={priority}
            role="img"
            aria-label={`${priority} priority`}
          >
            <Flag size={15} fill="currentColor" />
          </span>
        )}
        <button
          type="button"
          className={styles.more}
          data-ui-part="more"
          aria-label={moreLabel}
          title={moreLabel}
        >
          <MoreHorizontal size={18} />
        </button>
      </div>
    </div>
  );
}
