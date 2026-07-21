import type { FocusSession, FocusStartSpecInput } from "./focus-session-policy";
import {
  assertFocusSession,
  cloneFocusSession,
  normalizeFocusStartSpec,
  sameFocusStartSpec,
} from "./focus-session-policy";

export type FocusStartDecision =
  | Readonly<{ kind: "create"; session: FocusSession }>
  | Readonly<{ kind: "replay"; session: FocusSession }>
  | Readonly<{ kind: "recover"; session: FocusSession }>
  | Readonly<{ kind: "conflict"; reason: "session_id_reused" }>;

export type DecideFocusStartInput = Readonly<{
  id: string;
  spec: FocusStartSpecInput;
  existingById: FocusSession | null;
  unfinishedSession: FocusSession | null;
  now: Date;
}>;

export function decideFocusStart(input: DecideFocusStartInput): FocusStartDecision {
  const spec = normalizeFocusStartSpec(input.spec);

  if (input.existingById !== null) {
    assertFocusSession(input.existingById);
    if (!sameFocusStartSpec(input.existingById, spec)) {
      return { kind: "conflict", reason: "session_id_reused" };
    }
    if (input.existingById.state === "completed" && input.unfinishedSession !== null) {
      assertRecoverableSession(input.unfinishedSession);
      return { kind: "recover", session: cloneFocusSession(input.unfinishedSession) };
    }
    return { kind: "replay", session: cloneFocusSession(input.existingById) };
  }

  if (input.unfinishedSession !== null) {
    assertRecoverableSession(input.unfinishedSession);
    return { kind: "recover", session: cloneFocusSession(input.unfinishedSession) };
  }

  assertAuthoritativeNow(input.now);
  const now = new Date(input.now);
  return {
    kind: "create",
    session: {
      id: input.id,
      ...spec,
      state: "active",
      startedAt: now,
      pausedAt: null,
      accumulatedActiveSeconds: 0,
      endedAt: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
  };
}

function assertRecoverableSession(session: FocusSession): void {
  assertFocusSession(session);
  if (session.state === "completed") {
    throw new RangeError("The recovered focus session must be active or paused.");
  }
}

function assertAuthoritativeNow(now: Date): void {
  if (!Number.isFinite(now.getTime())) throw new RangeError("The authoritative focus time is invalid.");
}
