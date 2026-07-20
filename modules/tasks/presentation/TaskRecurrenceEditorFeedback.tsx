"use client";

import type { Ref } from "react";

import { isTaskApiError } from "./data/task-api-request";
import styles from "./TaskRecurrenceEditor.module.css";

export function TaskRecurrenceEditorFeedback({
  alertRef,
  canRetry,
  error,
  latestMatchesAttempt,
  latestSummary,
  latestUnavailable,
  loadingLatest,
  onKeepEditing,
  onRefreshLatest,
  onRetry,
  onUseLatest,
  pending,
  proposedSummary,
  recovering,
  recoveryReady,
}: Readonly<{
  alertRef: Ref<HTMLDivElement>;
  canRetry: boolean;
  error: unknown;
  latestMatchesAttempt: boolean;
  latestSummary: string | null;
  latestUnavailable: boolean;
  loadingLatest: boolean;
  onKeepEditing: () => void;
  onRefreshLatest: () => void;
  onRetry: () => void;
  onUseLatest: () => void;
  pending: boolean;
  proposedSummary: string | null;
  recovering: boolean;
  recoveryReady: boolean;
}>) {
  const permissionSafe = isTaskApiError(error) && (error.code === "FORBIDDEN" || error.code === "NOT_FOUND");
  const conflict = isTaskApiError(error) && error.code === "CONFLICT";
  const unknown = recovering && !conflict;
  return (
    <div ref={alertRef} className={styles.mutationError} role="alert" tabIndex={-1}>
      <strong>
        {permissionSafe
          ? "Recurrence is unavailable."
          : conflict
            ? "This recurrence changed elsewhere."
            : unknown
              ? "The recurrence update is unconfirmed."
              : "The recurrence was not saved."}
      </strong>
      <p>
        {permissionSafe
          ? "Your task was not changed."
          : conflict
            ? "Your entries are preserved while the latest task, schedule, and recurrence are checked."
            : unknown
              ? "The response did not confirm whether the change was saved. Your entries are preserved while authoritative state is checked."
              : isTaskApiError(error) && error.code === "VALIDATION_FAILED"
                ? error.message
                : "Your previous saved recurrence is unchanged. You can safely try again."}
      </p>
      {recovering ? (
        <div className={styles.comparison}>
          {proposedSummary ? <p>Your choice: {proposedSummary}</p> : null}
          <p>
            {loadingLatest
              ? "Loading the latest saved recurrence and schedule…"
              : latestUnavailable
                ? "The latest recurrence and schedule could not be loaded."
                : latestSummary
                  ? `Latest saved: ${latestSummary}`
                  : "Latest saved: Does not repeat"}
          </p>
          {latestMatchesAttempt ? (
            <p>The latest saved recurrence matches this attempt. Confirm it without writing again.</p>
          ) : null}
        </div>
      ) : null}
      <div className={styles.feedbackActions}>
        {recovering ? (
          <button
            className="quiet-button"
            type="button"
            disabled={!recoveryReady || pending}
            onClick={onUseLatest}
          >
            Use latest
          </button>
        ) : null}
        {!permissionSafe ? (
          <button
            className="secondary-button"
            type="button"
            disabled={(recovering && !recoveryReady) || pending}
            onClick={onKeepEditing}
          >
            Keep editing
          </button>
        ) : null}
        {latestUnavailable ? (
          <button className="secondary-button" type="button" disabled={pending} onClick={onRefreshLatest}>
            Refresh latest
          </button>
        ) : null}
        {!permissionSafe ? (
          <button
            className="secondary-button"
            type="button"
            disabled={!canRetry || pending}
            onClick={onRetry}
          >
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}
