import { FOCUS_VERSION_MAX } from "./focus-limits";
import type { FocusSession, FocusState } from "./focus-session-policy";
import {
  assertFocusSession,
  assertFocusVersion,
  cloneFocusSession,
  normalizeFocusCorrectionSeconds,
} from "./focus-session-policy";

export type FocusCorrectionLink =
  Readonly<{ kind: "task"; id: string }> | Readonly<{ kind: "habit"; id: string }> | null;

export type FocusCorrection = Readonly<{
  durationSeconds?: number | undefined;
  link?: FocusCorrectionLink | undefined;
}>;

export type FocusCorrectionDecision =
  | Readonly<{ kind: "apply"; session: FocusSession }>
  | Readonly<{ kind: "replay"; session: FocusSession }>
  | Readonly<{ kind: "no_op"; session: FocusSession }>
  | Readonly<{ kind: "stale" }>
  | Readonly<{ kind: "closed"; state: FocusState }>;

export type DecideFocusCorrectionInput = Readonly<{
  session: FocusSession;
  expectedVersion: number;
  correction: FocusCorrection;
  now: Date;
}>;

export function decideFocusCorrection(input: DecideFocusCorrectionInput): FocusCorrectionDecision {
  assertFocusSession(input.session);
  assertFocusVersion(input.expectedVersion, "Expected focus session version");
  assertCorrection(input.correction);
  assertAuthoritativeNow(input.now, input.session.updatedAt);

  if (input.session.state !== "completed" || input.session.kind !== "focus") {
    return { kind: "closed", state: input.session.state };
  }

  if (input.session.version !== input.expectedVersion) {
    if (
      input.session.version === input.expectedVersion + 1 &&
      matchesCorrection(input.session, input.correction)
    ) {
      return { kind: "replay", session: cloneFocusSession(input.session) };
    }
    return { kind: "stale" };
  }

  if (matchesCorrection(input.session, input.correction)) {
    return { kind: "no_op", session: cloneFocusSession(input.session) };
  }
  if (input.session.version === FOCUS_VERSION_MAX) {
    throw new RangeError("The focus session version cannot be incremented further.");
  }

  const target = correctionTarget(input.session, input.correction);

  return {
    kind: "apply",
    session: {
      ...input.session,
      accumulatedActiveSeconds: target.durationSeconds,
      taskId: target.taskId,
      habitId: target.habitId,
      version: input.session.version + 1,
      updatedAt: new Date(input.now),
    },
  };
}

function assertCorrection(correction: FocusCorrection): void {
  if (correction.durationSeconds === undefined && correction.link === undefined) {
    throw new RangeError("A focus correction must change duration or link.");
  }
  if (correction.durationSeconds !== undefined) {
    normalizeFocusCorrectionSeconds(correction.durationSeconds);
  }
  if (correction.link !== undefined && correction.link !== null) {
    if (correction.link.kind !== "task" && correction.link.kind !== "habit") {
      throw new RangeError("The corrected focus link kind is invalid.");
    }
    if (correction.link.id.length === 0) {
      throw new RangeError("A corrected focus link ID is required.");
    }
  }
}

function matchesCorrection(session: FocusSession, correction: FocusCorrection): boolean {
  const target = correctionTarget(session, correction);
  return (
    session.accumulatedActiveSeconds === target.durationSeconds &&
    session.taskId === target.taskId &&
    session.habitId === target.habitId
  );
}

function correctionTarget(
  session: FocusSession,
  correction: FocusCorrection,
): Readonly<{ durationSeconds: number; taskId: string | null; habitId: string | null }> {
  if (correction.link === undefined) {
    return {
      durationSeconds: correction.durationSeconds ?? session.accumulatedActiveSeconds,
      taskId: session.taskId,
      habitId: session.habitId,
    };
  }
  return {
    durationSeconds: correction.durationSeconds ?? session.accumulatedActiveSeconds,
    taskId: correction.link?.kind === "task" ? correction.link.id : null,
    habitId: correction.link?.kind === "habit" ? correction.link.id : null,
  };
}

function assertAuthoritativeNow(now: Date, updatedAt: Date): void {
  if (!Number.isFinite(now.getTime())) throw new RangeError("The authoritative focus time is invalid.");
  if (now.getTime() < updatedAt.getTime()) {
    throw new RangeError("The authoritative time cannot precede the last session update.");
  }
}
