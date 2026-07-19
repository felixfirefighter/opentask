import styles from "./TaskScheduleEditor.module.css";

export function TaskScheduleMutationFeedback({
  conflict,
  latestSummary,
  latestUnavailable,
  loadingLatest,
  onKeepEditing,
  onRefreshLatest,
  onRetry,
  onUseLatest,
  pending,
  proposedSummary,
}: Readonly<{
  conflict: boolean;
  latestSummary: string | null;
  latestUnavailable: boolean;
  loadingLatest: boolean;
  onKeepEditing: () => void;
  onRefreshLatest: () => void;
  onRetry: () => void;
  onUseLatest: () => void;
  pending: boolean;
  proposedSummary: string | null;
}>) {
  return (
    <div className={styles.mutationError} role="alert">
      <strong>{conflict ? "This schedule changed elsewhere." : "The schedule was not saved."}</strong>
      <p>
        {conflict
          ? "Your schedule choice is preserved while the latest task is checked."
          : "Your previous saved schedule is unchanged. You can safely try again."}
      </p>
      {conflict ? (
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
        </div>
      ) : null}
      <div className={styles.errorActions}>
        {conflict ? (
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
          disabled={pending || (conflict && (loadingLatest || latestUnavailable))}
          onClick={onRetry}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
