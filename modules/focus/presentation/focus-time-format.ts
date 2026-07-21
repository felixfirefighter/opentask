import type { FocusTimerView } from "./focus-screen-model";

export type FocusTimerDisplay = Readonly<{
  durationSeconds: number;
  label: string;
  overtime: boolean;
  text: string;
}>;

export function focusTimerDisplay(timer: Extract<FocusTimerView, { kind: "session" }>): FocusTimerDisplay {
  if (timer.mode === "stopwatch" || timer.plannedSeconds === null) {
    const seconds = normalizeSeconds(timer.displayedElapsedSeconds);
    return {
      durationSeconds: seconds,
      label: `${formatSpokenDuration(seconds)} elapsed`,
      overtime: false,
      text: formatTimerSeconds(seconds),
    };
  }

  const difference = timer.plannedSeconds - normalizeSeconds(timer.displayedElapsedSeconds);
  if (difference > 0) {
    return {
      durationSeconds: difference,
      label: `${formatSpokenDuration(difference)} remaining`,
      overtime: false,
      text: formatTimerSeconds(difference),
    };
  }
  const overtimeSeconds = Math.abs(difference);
  return {
    durationSeconds: overtimeSeconds,
    label: `${formatSpokenDuration(overtimeSeconds)} overtime`,
    overtime: true,
    text: `+${formatTimerSeconds(overtimeSeconds)}`,
  };
}

export function formatFocusDuration(seconds: number): string {
  const totalMinutes = Math.floor(normalizeSeconds(seconds) / 60);
  if (totalMinutes < 1) return "Less than 1 min";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

function formatTimerSeconds(seconds: number): string {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  const minuteText = String(minutes).padStart(2, "0");
  const base = `${minuteText}:${String(remainder).padStart(2, "0")}`;
  return hours > 0 ? `${String(hours).padStart(2, "0")}:${base}` : base;
}

function formatSpokenDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return [
    hours > 0 ? `${hours} ${hours === 1 ? "hour" : "hours"}` : null,
    minutes > 0 ? `${minutes} ${minutes === 1 ? "minute" : "minutes"}` : null,
    remainder > 0 || (hours === 0 && minutes === 0)
      ? `${remainder} ${remainder === 1 ? "second" : "seconds"}`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizeSeconds(seconds: number): number {
  return Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
}
