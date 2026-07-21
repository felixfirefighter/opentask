import { FOCUS_RECORDED_SECONDS_MAX, FOCUS_VERSION_MAX } from "./focus-limits";
import type { FocusSession, FocusState } from "./focus-session-policy";
import {
  assertFocusSession,
  assertFocusVersion,
  assertRecordedFocusSeconds,
  cloneFocusSession,
} from "./focus-session-policy";

export const focusTransitionCommands = ["pause", "resume", "finish"] as const;
export type FocusTransitionCommand = (typeof focusTransitionCommands)[number];

export type FocusTransitionDecision =
  | Readonly<{ kind: "apply"; session: FocusSession }>
  | Readonly<{ kind: "replay"; session: FocusSession }>
  | Readonly<{ kind: "stale" }>
  | Readonly<{ kind: "closed"; state: FocusState }>;

export type DecideFocusTransitionInput = Readonly<{
  session: FocusSession;
  command: FocusTransitionCommand;
  expectedVersion: number;
  now: Date;
}>;

export function decideFocusTransition(input: DecideFocusTransitionInput): FocusTransitionDecision {
  assertFocusSession(input.session);
  assertFocusVersion(input.expectedVersion, "Expected focus session version");
  assertAuthoritativeNow(input.now);
  if (!focusTransitionCommands.includes(input.command)) {
    throw new RangeError("The focus transition command is invalid.");
  }

  if (input.session.version !== input.expectedVersion) {
    if (
      input.session.version === input.expectedVersion + 1 &&
      input.session.state === targetState(input.command)
    ) {
      return { kind: "replay", session: cloneFocusSession(input.session) };
    }
    return { kind: "stale" };
  }

  if (!canApply(input.session.state, input.command)) {
    return { kind: "closed", state: input.session.state };
  }
  if (input.session.version === FOCUS_VERSION_MAX) {
    throw new RangeError("The focus session version cannot be incremented further.");
  }

  const now = new Date(input.now);
  assertChronologicalNow(input.session, input.command, now);
  const accumulatedActiveSeconds =
    input.session.state === "active" && input.command !== "resume"
      ? addActiveSegment(input.session, now)
      : input.session.accumulatedActiveSeconds;

  const common = {
    ...input.session,
    accumulatedActiveSeconds,
    version: input.session.version + 1,
    updatedAt: now,
  };

  if (input.command === "pause") {
    return {
      kind: "apply",
      session: { ...common, state: "paused", pausedAt: now, endedAt: null },
    };
  }
  if (input.command === "resume") {
    return {
      kind: "apply",
      session: { ...common, state: "active", startedAt: now, pausedAt: null, endedAt: null },
    };
  }
  return {
    kind: "apply",
    session: { ...common, state: "completed", pausedAt: null, endedAt: now },
  };
}

function canApply(state: FocusState, command: FocusTransitionCommand): boolean {
  if (command === "pause") return state === "active";
  if (command === "resume") return state === "paused";
  return state === "active" || state === "paused";
}

function targetState(command: FocusTransitionCommand): FocusState {
  if (command === "pause") return "paused";
  if (command === "resume") return "active";
  return "completed";
}

function addActiveSegment(session: FocusSession, now: Date): number {
  const elapsedMilliseconds = now.getTime() - session.startedAt.getTime();
  if (elapsedMilliseconds < 0) {
    throw new RangeError("The authoritative time cannot precede the active segment.");
  }
  const elapsedSeconds = Math.floor(elapsedMilliseconds / 1_000);
  const total = session.accumulatedActiveSeconds + elapsedSeconds;
  if (!Number.isSafeInteger(total) || total > FOCUS_RECORDED_SECONDS_MAX) {
    throw new RangeError("The focus duration exceeds the supported range.");
  }
  assertRecordedFocusSeconds(total);
  return total;
}

function assertChronologicalNow(session: FocusSession, command: FocusTransitionCommand, now: Date): void {
  if (now.getTime() < session.updatedAt.getTime()) {
    throw new RangeError("The authoritative time cannot precede the last session update.");
  }
  if (command === "resume" && session.pausedAt !== null && now.getTime() < session.pausedAt.getTime()) {
    throw new RangeError("The authoritative time cannot precede the session pause.");
  }
}

function assertAuthoritativeNow(now: Date): void {
  if (!Number.isFinite(now.getTime())) throw new RangeError("The authoritative focus time is invalid.");
}
