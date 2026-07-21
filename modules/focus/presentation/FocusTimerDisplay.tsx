import type { FocusTimerView } from "./focus-screen-model";
import { focusTimerDisplay } from "./focus-time-format";
import styles from "./FocusTimerCard.module.css";

export function FocusTimerDisplay({ timer }: Readonly<{ timer: FocusTimerView }>) {
  if (timer.kind === "idle") {
    const seconds = timer.mode === "pomodoro" ? timer.focusPlannedSeconds : 0;
    return (
      <time
        className={styles.timerDisplay}
        aria-label={timer.mode === "pomodoro" ? "Planned focus duration" : "Stopwatch ready"}
        dateTime={`PT${seconds}S`}
      >
        {timer.mode === "pomodoro" ? formatIdleSeconds(seconds) : "00:00"}
      </time>
    );
  }
  const display = focusTimerDisplay(timer);
  return (
    <time
      className={styles.timerDisplay}
      data-overtime={display.overtime || undefined}
      aria-label={display.label}
      dateTime={`PT${display.durationSeconds}S`}
    >
      {display.text}
    </time>
  );
}

function formatIdleSeconds(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(safeSeconds / 3_600);
  const minutes = Math.floor((safeSeconds % 3_600) / 60);
  const remainder = safeSeconds % 60;
  const base = `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  return hours > 0 ? `${String(hours).padStart(2, "0")}:${base}` : base;
}
