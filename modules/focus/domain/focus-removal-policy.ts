import type { FocusSession, FocusState } from "./focus-session-policy";
import { assertFocusSession, assertFocusVersion } from "./focus-session-policy";

export type FocusRemovalDecision =
  | Readonly<{ kind: "delete" }>
  | Readonly<{ kind: "stale" }>
  | Readonly<{ kind: "closed"; state: FocusState }>;

export function decideFocusDiscard(session: FocusSession, expectedVersion: number): FocusRemovalDecision {
  return decideRemoval(session, expectedVersion, "unfinished");
}

export function decideCompletedFocusDeletion(
  session: FocusSession,
  expectedVersion: number,
): FocusRemovalDecision {
  return decideRemoval(session, expectedVersion, "completed_focus");
}

function decideRemoval(
  session: FocusSession,
  expectedVersion: number,
  allowed: "unfinished" | "completed_focus",
): FocusRemovalDecision {
  assertFocusSession(session);
  assertFocusVersion(expectedVersion, "Expected focus session version");
  if (session.version !== expectedVersion) return { kind: "stale" };

  if (allowed === "unfinished" && session.state !== "completed") return { kind: "delete" };
  if (allowed === "completed_focus" && session.state === "completed" && session.kind === "focus") {
    return { kind: "delete" };
  }
  return { kind: "closed", state: session.state };
}
