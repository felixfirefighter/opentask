import { FOCUS_RECORDED_SECONDS_MAX } from "./focus-limits";
import type { FocusSession, FocusState } from "./focus-session-policy";
import { assertFocusSession } from "./focus-session-policy";

export type FocusTimerReading = Readonly<{
  authoritativeAt: Date;
  state: FocusState;
  elapsedActiveSeconds: number;
  remainingSeconds: number | null;
  overtimeSeconds: number;
  planReached: boolean;
}>;

export function reconstructFocusTimer(session: FocusSession, now: Date): FocusTimerReading {
  assertFocusSession(session);
  if (!Number.isFinite(now.getTime())) throw new RangeError("The authoritative focus time is invalid.");

  let elapsedActiveSeconds = session.accumulatedActiveSeconds;
  if (session.state === "active") {
    const elapsedMilliseconds = now.getTime() - session.startedAt.getTime();
    if (elapsedMilliseconds < 0) {
      throw new RangeError("The authoritative time cannot precede the active segment.");
    }
    elapsedActiveSeconds += Math.floor(elapsedMilliseconds / 1_000);
  }
  if (!Number.isSafeInteger(elapsedActiveSeconds) || elapsedActiveSeconds > FOCUS_RECORDED_SECONDS_MAX) {
    throw new RangeError("The focus duration exceeds the supported range.");
  }

  const plannedSeconds = session.plannedSeconds;
  return {
    authoritativeAt: new Date(now),
    state: session.state,
    elapsedActiveSeconds,
    remainingSeconds: plannedSeconds === null ? null : Math.max(plannedSeconds - elapsedActiveSeconds, 0),
    overtimeSeconds: plannedSeconds === null ? 0 : Math.max(elapsedActiveSeconds - plannedSeconds, 0),
    planReached: plannedSeconds !== null && elapsedActiveSeconds >= plannedSeconds,
  };
}
