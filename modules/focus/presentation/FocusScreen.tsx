"use client";

import type {
  FocusActiveView,
  FocusHistoryView,
  FocusLinkSearchView,
  FocusPendingAction,
  FocusPresentationActions,
  FocusSummaryView,
} from "./focus-screen-model";
import { focusWritesDisabled } from "./focus-screen-model";
import {
  FocusActiveReadError,
  FocusConditionBanner,
  FocusPermissionState,
  FocusTimerLoading,
  FocusTransitionAnnouncement,
} from "./FocusCondition";
import { FocusHistory } from "./FocusHistory";
import styles from "./FocusScreen.module.css";
import { FocusSummary } from "./FocusSummary";
import { FocusTimerCard } from "./FocusTimerCard";

export function FocusScreen({
  actions,
  active,
  announcement = null,
  history,
  linkSearch,
  pendingAction = null,
  summary,
}: Readonly<{
  actions: FocusPresentationActions;
  active: FocusActiveView;
  announcement?: string | null;
  history: FocusHistoryView;
  linkSearch: FocusLinkSearchView;
  pendingAction?: FocusPendingAction | null;
  summary: FocusSummaryView;
}>) {
  if (active.kind === "permission") {
    return (
      <div className={styles.page}>
        <FocusPageHeader />
        <FocusPermissionState />
      </div>
    );
  }

  const writesDisabled = focusWritesDisabled(active);
  const timerContent =
    active.kind === "loading" ? (
      <FocusTimerLoading />
    ) : active.kind === "error" ? (
      <FocusActiveReadError message={active.message} onRetry={actions.onRetryActive} />
    ) : (
      <FocusTimerCard
        actions={actions}
        linkSearch={linkSearch}
        pendingAction={pendingAction}
        projected={
          (active.kind === "offline" || active.kind === "read-stale") && active.timer.kind === "session"
        }
        timer={active.timer}
        writesDisabled={writesDisabled}
      />
    );

  return (
    <div className={styles.page}>
      <FocusPageHeader />
      <FocusTransitionAnnouncement announcement={announcement} />
      <FocusConditionBanner active={active} onRetry={actions.onRetryActive} />
      <div className={styles.layout}>
        <div className={styles.timerRegion}>{timerContent}</div>
        <div className={styles.insights}>
          <FocusSummary onRetry={actions.onRetrySummary} summary={summary} />
          <FocusHistory
            actions={actions}
            disabled={writesDisabled || history.kind === "error"}
            history={history}
            linkSearch={linkSearch}
            pendingAction={pendingAction}
          />
        </div>
      </div>
    </div>
  );
}

function FocusPageHeader() {
  return (
    <header className={styles.pageHeader}>
      <div>
        <p className="eyebrow">Make time</p>
        <h1 tabIndex={-1} data-route-focus>
          Focus
        </h1>
        <p>One timer, rebuilt from authoritative server time.</p>
      </div>
    </header>
  );
}
