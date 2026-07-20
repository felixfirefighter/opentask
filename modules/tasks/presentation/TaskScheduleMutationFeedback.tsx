import type { Ref } from "react";

import styles from "./TaskScheduleEditor.module.css";

export function TaskScheduleMutationFeedback({
  alertRef,
  conflict,
  latestMatchesProposal,
  latestSummary,
  latestUnavailable,
  loadingLatest,
  onKeepEditing,
  onRefreshLatest,
  onRetry,
  onUseLatest,
  pending,
  proposedSummary,
  unconfirmed,
}: Readonly<{
  alertRef: Ref<HTMLDivElement>;
  conflict: boolean;
  latestMatchesProposal: boolean;
  latestSummary: string | null;
  latestUnavailable: boolean;
  loadingLatest: boolean;
  onKeepEditing: () => void;
  onRefreshLatest: () => void;
  onRetry: () => void;
  onUseLatest: () => void;
  pending: boolean;
  proposedSummary: string | null;
  unconfirmed: boolean;
}>) {
  const recovering = conflict || unconfirmed;
  return (
    <div ref={alertRef} className={styles.mutationError} role="alert" tabIndex={-1}>
      <strong>
        {conflict
          ? "This schedule changed elsewhere."
          : unconfirmed
            ? "The schedule update is unconfirmed."
            : "The schedule was not saved."}
      </strong>
      <p>
        {conflict
          ? "Your schedule choice is preserved while the latest task is checked."
          : unconfirmed
            ? "The response did not confirm whether your change was saved. Your choice is preserved while the latest schedule is checked."
            : "Your previous saved schedule is unchanged. You can safely try again."}
      </p>
      {recovering ? (
        <div className={styles.comparison}>
          {proposedSummary ? <p>Your choice: {proposedSummary}</p> : null}
          <p>
            {loadingLatest
              ? "Loading the latest saved schedule…"
              : latestSummary
                ? `Latest saved: ${latestSummary}`
                : latestUnavailable
                  ? "The latest schedule could not be loaded."
                  : "Latest saved: No schedule"}
          </p>
          {latestMatchesProposal ? (
            <p>The latest saved schedule matches your choice. Confirm it without writing again.</p>
          ) : null}
        </div>
      ) : null}
      <div className={styles.errorActions}>
        {recovering ? (
          <button
            className="quiet-button"
            type="button"
            disabled={loadingLatest || latestUnavailable}
            onClick={onUseLatest}
          >
            Use latest
          </button>
        ) : null}
        <button className="secondary-button" type="button" onClick={onKeepEditing}>
          Keep editing
        </button>
        {latestUnavailable ? (
          <button className="secondary-button" type="button" onClick={onRefreshLatest}>
            Refresh latest
          </button>
        ) : null}
        <button
          className="secondary-button"
          type="button"
          disabled={pending || (recovering && (loadingLatest || latestUnavailable))}
          onClick={onRetry}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
