"use client";

import type { InboxSummary } from "../application/inbox";

import styles from "./InboxScreen.module.css";

type ReadyInboxScreenProps = Readonly<{
  state?: "ready";
  summary: InboxSummary;
}>;

type LoadingInboxScreenProps = Readonly<{
  state: "loading";
}>;

type ErrorInboxScreenProps = Readonly<{
  state: "error";
  onRetry: () => void;
}>;

type UnavailableInboxScreenProps = Readonly<{
  state: "unavailable";
}>;

export type InboxScreenProps =
  ReadyInboxScreenProps | LoadingInboxScreenProps | ErrorInboxScreenProps | UnavailableInboxScreenProps;

const SKELETON_ROWS = ["first", "second", "third"] as const;

export function InboxScreen(props: InboxScreenProps) {
  const title = "summary" in props ? props.summary.name : "Inbox";

  return (
    <section className={styles.screen} aria-labelledby="inbox-heading">
      <div className={styles.workSurface}>
        <header className={styles.header}>
          <h1 id="inbox-heading" className={styles.title} tabIndex={-1} data-route-focus>
            {title}
          </h1>
        </header>

        <InboxState {...props} />
      </div>
    </section>
  );
}

function InboxState(props: InboxScreenProps) {
  if (props.state === "loading") {
    return (
      <div className={`${styles.statePanel} ${styles.loadingPanel}`} aria-busy="true">
        <p className={styles.loadingLabel} role="status">
          Loading Inbox
        </p>
        <div className={styles.skeletonList} aria-hidden="true">
          {SKELETON_ROWS.map((row) => (
            <div className={styles.skeletonRow} key={row}>
              <span className={styles.skeletonStatus} />
              <span className={styles.skeletonCopy}>
                <span className={styles.skeletonTitle} />
                <span className={styles.skeletonMeta} />
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (props.state === "error") {
    return (
      <div className={styles.statePanel} role="alert" aria-labelledby="inbox-error-title">
        <div className={styles.stateMessage}>
          <h2 id="inbox-error-title">Inbox could not be loaded</h2>
          <p>Try loading your Inbox again.</p>
          <button className={styles.retryButton} type="button" onClick={props.onRetry}>
            Retry Inbox
          </button>
        </div>
      </div>
    );
  }

  if (props.state === "unavailable") {
    return (
      <div className={styles.statePanel} aria-labelledby="inbox-unavailable-title">
        <div className={styles.stateMessage}>
          <h2 id="inbox-unavailable-title">Inbox unavailable</h2>
          <p>This Inbox could not be found or you may not have access.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.statePanel} aria-labelledby="inbox-empty-title">
      <div className={styles.stateMessage}>
        <h2 id="inbox-empty-title">Inbox is empty</h2>
        <p>Task capture is not available in this build yet.</p>
      </div>
    </div>
  );
}
