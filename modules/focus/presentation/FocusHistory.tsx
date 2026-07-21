import { History } from "lucide-react";

import { Button } from "@/shared/presentation";

import type {
  FocusHistoryView,
  FocusLinkSearchView,
  FocusPendingAction,
  FocusPresentationActions,
} from "./focus-screen-model";
import styles from "./FocusHistory.module.css";
import { FocusHistoryRow } from "./FocusHistoryRow";

export function FocusHistory({
  actions,
  disabled,
  history,
  linkSearch,
  pendingAction,
}: Readonly<{
  actions: FocusPresentationActions;
  disabled: boolean;
  history: FocusHistoryView;
  linkSearch: FocusLinkSearchView;
  pendingAction: FocusPendingAction | null;
}>) {
  const items = history.kind === "loading" ? [] : (history.items ?? []);
  const focusItems = items.filter((item) => item.kind === "focus");
  return (
    <section className={styles.card} aria-labelledby="focus-history-heading">
      <div className={styles.header}>
        <div>
          <p className="eyebrow">Completed work</p>
          <h2 id="focus-history-heading">Recent sessions</h2>
        </div>
      </div>
      {history.kind === "error" ? (
        <div className={styles.error} role="alert">
          <strong>{history.title ?? "Focus history could not be loaded"}</strong>
          <span>{history.message}</span>
          <Button type="button" variant="secondary" onClick={actions.onRetryHistory}>
            Retry history
          </Button>
        </div>
      ) : null}
      {history.kind === "loading" ? (
        <div className={styles.loading} aria-busy="true">
          <p className="sr-only" role="status">
            Loading recent Focus sessions
          </p>
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </div>
      ) : focusItems.length === 0 && history.kind !== "error" ? (
        <div className={styles.empty}>
          <History size={22} aria-hidden="true" />
          <h3>No focus sessions yet</h3>
          <p>Finished focus intervals will appear here. Breaks stay separate.</p>
        </div>
      ) : focusItems.length > 0 ? (
        <ul className={styles.list} aria-label="Completed focus sessions">
          {focusItems.map((item) => (
            <FocusHistoryRow
              disabled={disabled}
              item={item}
              linkSearch={linkSearch}
              key={item.id}
              onCorrect={(correction) => actions.onCorrect(item.id, correction)}
              onDelete={() => actions.onDelete(item.id)}
              onLinkSearch={actions.onLinkSearch}
              pendingCorrection={pendingAction === "correct"}
              pendingDelete={pendingAction === "delete"}
            />
          ))}
        </ul>
      ) : null}
      {disabled && focusItems.length > 0 ? (
        <p className={styles.disabledReason}>Reconnect or refresh before correcting or deleting a session.</p>
      ) : null}
    </section>
  );
}
