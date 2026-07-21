import { Check, RefreshCw } from "lucide-react";

import { occurrenceErrorMessage } from "./task-occurrence-labels";
import type { TaskWriteOutcome } from "./task-write-outcome";
import styles from "./TaskOccurrencePanel.module.css";

export function TaskOccurrencePanelFeedback({
  awaitingAheadRetryRefresh,
  disabled,
  hasExactRetry,
  hasMutationError,
  latestUnavailable,
  mutationPending,
  mutationSuccessful,
  occurrenceFetching,
  onContinueLatest,
  onRefreshLatest,
  onRetryExact,
  recoveryRequired,
  refreshError,
  taskRefreshing,
  taskSnapshotAhead,
  taskSnapshotBehind,
  taskSnapshotMismatch,
  writeOutcome,
}: Readonly<{
  awaitingAheadRetryRefresh: boolean;
  disabled: boolean;
  hasExactRetry: boolean;
  hasMutationError: boolean;
  latestUnavailable: boolean;
  mutationPending: boolean;
  mutationSuccessful: boolean;
  occurrenceFetching: boolean;
  onContinueLatest: () => void;
  onRefreshLatest: () => void;
  onRetryExact: () => void;
  recoveryRequired: boolean;
  refreshError: boolean;
  taskRefreshing: boolean;
  taskSnapshotAhead: boolean;
  taskSnapshotBehind: boolean;
  taskSnapshotMismatch: boolean;
  writeOutcome: TaskWriteOutcome | null;
}>) {
  return (
    <>
      {hasMutationError ? (
        <p className={styles.error} role="alert">
          {occurrenceErrorMessage(writeOutcome, latestUnavailable)}
        </p>
      ) : null}
      {refreshError && !hasMutationError ? (
        <p className={styles.error} role="alert">
          {awaitingAheadRetryRefresh
            ? "The occurrence change was recorded, but the latest task and occurrence state could not be loaded. Occurrence actions remain unavailable."
            : taskSnapshotBehind
              ? "This occurrence is newer than the task details, but the latest task state could not be loaded. Occurrence actions remain unavailable."
              : taskSnapshotAhead
                ? "This task changed, but its latest occurrence state could not be loaded. Occurrence actions remain unavailable."
                : "A fresh occurrence copy could not be loaded. The server-rendered occurrence snapshot remains visible."}
        </p>
      ) : null}
      {recoveryRequired ? (
        <div className={styles.recoveryActions}>
          <button
            className="secondary-button"
            type="button"
            disabled={disabled || mutationPending || !hasExactRetry}
            onClick={onRetryExact}
          >
            Retry exact occurrence change
          </button>
          <button
            className="quiet-button"
            type="button"
            disabled={disabled || occurrenceFetching || taskRefreshing || refreshError}
            onClick={onContinueLatest}
          >
            Continue with latest state
          </button>
        </div>
      ) : null}
      {latestUnavailable || awaitingAheadRetryRefresh || (refreshError && !hasMutationError) ? (
        <button
          className="quiet-button"
          type="button"
          disabled={occurrenceFetching || taskRefreshing}
          onClick={onRefreshLatest}
        >
          {awaitingAheadRetryRefresh
            ? "Load latest task and occurrence"
            : taskSnapshotBehind
              ? "Load latest task state"
              : "Load latest occurrence"}
        </button>
      ) : null}
      <p className={styles.saveState} role="status" aria-live="polite">
        {mutationPending ? (
          <>
            <RefreshCw size={13} aria-hidden="true" /> Saving occurrence…
          </>
        ) : disabled ? (
          "Reconnect to change this occurrence."
        ) : refreshError && (taskSnapshotMismatch || awaitingAheadRetryRefresh) ? (
          "Latest task and occurrence state unavailable."
        ) : occurrenceFetching || taskRefreshing || taskSnapshotMismatch || awaitingAheadRetryRefresh ? (
          <>
            <RefreshCw size={13} aria-hidden="true" /> Loading latest task and occurrence…
          </>
        ) : mutationSuccessful ? (
          <>
            <Check size={13} aria-hidden="true" /> Occurrence saved
          </>
        ) : (
          ""
        )}
      </p>
    </>
  );
}
