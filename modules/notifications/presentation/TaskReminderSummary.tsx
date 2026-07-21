"use client";

import type { ReactNode } from "react";

import styles from "./TaskReminderPanel.module.css";
import type { useTaskReminderController } from "./use-task-reminder-controller";

export function TaskReminderActions({
  controller,
  canEdit,
  disabled,
  hasReminder,
}: Readonly<{
  controller: ReturnType<typeof useTaskReminderController>;
  canEdit: boolean;
  disabled: boolean;
  hasReminder: boolean;
}>) {
  if (!hasReminder) {
    return (
      <button
        className="secondary-button"
        type="button"
        disabled={disabled || !canEdit}
        onClick={controller.beginEditing}
      >
        Add reminder
      </button>
    );
  }
  if (controller.confirmingRemove) {
    return (
      <div className={styles.confirmation} role="group" aria-label="Confirm reminder removal">
        <span>Remove this reminder definition?</span>
        <button
          type="button"
          className="quiet-button"
          disabled={controller.pending}
          onClick={() => controller.setConfirmingRemove(false)}
        >
          Keep reminder
        </button>
        <button
          type="button"
          className={styles.dangerAction}
          disabled={disabled || controller.pending}
          onClick={() => void controller.remove()}
        >
          {controller.pending ? "Removing…" : "Remove reminder"}
        </button>
        {controller.error ? <ReminderActionError controller={controller} disabled={disabled} /> : null}
        {controller.latestReloaded ? (
          <p className={styles.interpretation} role="status">
            Latest reminder loaded. Review it before retrying.
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div className={styles.summaryActions}>
      <button
        className="secondary-button"
        type="button"
        disabled={disabled || !canEdit || controller.pending}
        onClick={controller.beginEditing}
      >
        Edit reminder
      </button>
      <button
        className="quiet-button"
        type="button"
        disabled={disabled || controller.pending || (!controller.reminder?.enabled && !canEdit)}
        onClick={() => void controller.setEnabled(!controller.reminder?.enabled)}
      >
        {controller.reminder?.enabled ? "Disable" : "Enable"}
      </button>
      <button
        className="quiet-button"
        type="button"
        disabled={disabled || controller.pending}
        onClick={() => controller.setConfirmingRemove(true)}
      >
        Remove…
      </button>
      {controller.error ? <ReminderActionError controller={controller} disabled={disabled} /> : null}
      {controller.latestReloaded ? (
        <p className={styles.interpretation} role="status">
          Latest reminder loaded. Review it before retrying.
        </p>
      ) : null}
    </div>
  );
}

function ReminderActionError({
  controller,
  disabled,
}: Readonly<{ controller: ReturnType<typeof useTaskReminderController>; disabled: boolean }>) {
  return (
    <div className={styles.conflictState}>
      <p className={styles.error} role="alert">
        {notificationErrorMessage(controller.error, controller.conflict)}
      </p>
      <button
        type="button"
        className="quiet-button"
        disabled={disabled || controller.pending}
        onClick={() => void controller.reloadLatest()}
      >
        {controller.conflict ? "Load latest reminder" : "Check saved reminder"}
      </button>
    </div>
  );
}

export function TaskReminderState({
  taskId,
  message,
  busy = false,
  action = null,
}: Readonly<{ taskId: string; message: string; busy?: boolean; action?: ReactNode }>) {
  return (
    <section
      className={styles.group}
      aria-labelledby={`reminder-title-${taskId}`}
      aria-busy={busy || undefined}
    >
      <h2 id={`reminder-title-${taskId}`}>Reminder</h2>
      <div className={styles.state} role={busy ? "status" : "alert"}>
        {message}
        {action}
      </div>
    </section>
  );
}

export function notificationErrorMessage(error: unknown, conflict: boolean): string | null {
  if (!error) return null;
  return conflict
    ? "This reminder changed elsewhere. Refresh the latest version before trying again."
    : "The reminder change could not be confirmed. Check the saved reminder before retrying.";
}
