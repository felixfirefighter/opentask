import { Link2, TimerReset } from "lucide-react";

import type {
  FocusLinkSearchView,
  FocusPendingAction,
  FocusPresentationActions,
  FocusTimerView,
} from "./focus-screen-model";
import { FocusDurationFields } from "./FocusDurationFields";
import { FocusLinkPicker } from "./FocusLinkPicker";
import { FocusModeSelector } from "./FocusModeSelector";
import styles from "./FocusTimerCard.module.css";
import { FocusTimerControls } from "./FocusTimerControls";
import { FocusTimerDisplay } from "./FocusTimerDisplay";

export function FocusTimerCard({
  actions,
  linkSearch,
  pendingAction,
  projected,
  timer,
  writesDisabled,
}: Readonly<{
  actions: FocusPresentationActions;
  linkSearch: FocusLinkSearchView;
  pendingAction: FocusPendingAction | null;
  projected: boolean;
  timer: FocusTimerView;
  writesDisabled: boolean;
}>) {
  const phase = timer.kind === "session" && timer.phase === "break" ? "Break" : "Focus";
  const status = timer.kind === "idle" ? "Ready" : timer.status === "paused" ? "Paused" : "Running";
  return (
    <section className={styles.card} aria-labelledby="focus-timer-heading">
      <div className={styles.cardHeader}>
        <div>
          <p className="eyebrow">{phase}</p>
          <h2 id="focus-timer-heading">Focus timer</h2>
        </div>
        <span className={styles.state} data-state={timer.kind === "idle" ? "idle" : timer.status}>
          {status}
        </span>
      </div>
      <FocusModeSelector
        disabled={writesDisabled || timer.kind === "session"}
        mode={timer.mode}
        onChange={actions.onModeChange}
      />
      <FocusTimerDisplay timer={timer} />
      <p className={styles.modeText}>
        {timer.mode === "pomodoro" ? "Pomodoro" : "Stopwatch"}
        {timer.kind === "session" && timer.phase === "break" ? " · Explicit break" : ""}
      </p>
      {projected ? (
        <p className={styles.projected}>
          <TimerReset size={16} aria-hidden="true" /> Projected from the last server update
        </p>
      ) : null}
      {timer.kind === "idle" ? (
        <div className={styles.setup}>
          {timer.mode === "pomodoro" ? (
            <FocusDurationFields
              breakSeconds={timer.breakPlannedSeconds}
              disabled={writesDisabled}
              focusSeconds={timer.focusPlannedSeconds}
              onBreakChange={actions.onBreakDurationChange}
              onFocusChange={actions.onFocusDurationChange}
            />
          ) : null}
          <FocusLinkPicker
            disabled={writesDisabled}
            link={timer.link}
            onChange={actions.onLinkChange}
            onSearch={actions.onLinkSearch}
            search={linkSearch}
          />
        </div>
      ) : timer.phase === "break" ? (
        <p className={styles.breakNote}>Break time is kept separate from Focus history and totals.</p>
      ) : timer.link ? (
        <div className={styles.activeLink}>
          <Link2 size={16} aria-hidden="true" />
          <span>
            <strong>
              {timer.link.available && timer.link.label ? timer.link.label : "Linked item unavailable"}
            </strong>
            <small>{timer.link.available ? timer.link.kind : "Linked item unavailable"}</small>
          </span>
        </div>
      ) : (
        <p className={styles.breakNote}>No task or habit linked.</p>
      )}
      <FocusTimerControls
        actions={actions}
        disabled={writesDisabled}
        pendingAction={pendingAction}
        timer={timer}
      />
      {writesDisabled ? (
        <p className={styles.disabledReason}>
          Reconnect or refresh authoritative timer state to make changes.
        </p>
      ) : null}
    </section>
  );
}
