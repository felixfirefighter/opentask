import { Repeat2 } from "lucide-react";

import styles from "./TaskOccurrencePanel.module.css";

export function TaskOccurrenceUnavailable({
  loading,
  onRetry,
  recovery,
  taskId,
}: Readonly<{
  loading: boolean;
  onRetry: () => void;
  recovery?:
    | Readonly<{
        continueDisabled: boolean;
        message: string;
        onContinue: () => void;
        onRetryExact: () => void;
        retryDisabled: boolean;
      }>
    | undefined;
  taskId: string;
}>) {
  return (
    <section className={styles.group} aria-labelledby={`occurrence-title-${taskId}`}>
      <div className={styles.heading}>
        <div>
          <h2 id={`occurrence-title-${taskId}`}>Selected occurrence</h2>
          <p>This occurrence is no longer available under the current series schedule.</p>
        </div>
        <Repeat2 size={18} aria-hidden="true" />
      </div>
      {recovery ? (
        <>
          <p className={styles.error} role="alert">
            {recovery.message}
          </p>
          <div className={styles.recoveryActions}>
            <button
              className="secondary-button"
              type="button"
              disabled={recovery.retryDisabled}
              onClick={recovery.onRetryExact}
            >
              Retry exact occurrence change
            </button>
            <button
              className="quiet-button"
              type="button"
              disabled={recovery.continueDisabled}
              onClick={recovery.onContinue}
            >
              Continue with latest state
            </button>
          </div>
        </>
      ) : null}
      <button className="quiet-button" type="button" disabled={loading} onClick={onRetry}>
        {loading ? "Checking occurrence…" : "Check again"}
      </button>
    </section>
  );
}
