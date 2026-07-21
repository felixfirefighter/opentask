import type { FocusStartRequest, FocusTimerSnapshot } from "../application/contracts";
import { isFocusApiError } from "./data/focus-api-request";
import type { FocusActiveView, FocusLinkView, FocusModeView, FocusTimerView } from "./focus-screen-model";

export type FocusConditionMarker = Readonly<{
  kind: "reconnect" | "conflict" | "mutation-error";
  message: string;
}> | null;

export class FocusActiveReadRecoveryError extends Error {
  override readonly name = "FocusActiveReadRecoveryError";
}

export function focusActiveView(
  input: Readonly<{
    data: FocusTimerSnapshot | null | undefined;
    error: unknown;
    pending: boolean;
    online: boolean;
    marker: FocusConditionMarker;
    timer: FocusTimerView;
  }>,
): FocusActiveView {
  if (isPermissionError(input.error)) return { kind: "permission" };
  if (!input.online && input.data !== undefined) return { kind: "offline", timer: input.timer };
  if (input.data === undefined && input.pending) return { kind: "loading" };
  if (input.data === undefined) {
    return {
      kind: "error",
      message: "The authoritative timer could not be loaded.",
    };
  }
  if (input.marker?.kind === "mutation-error") return { ...input.marker, timer: input.timer };
  if (input.error) {
    return {
      kind: "read-stale",
      message: "The last saved timer is shown, but the latest server state could not be loaded.",
      timer: input.timer,
    };
  }
  if (input.marker) return { ...input.marker, timer: input.timer };
  return { kind: "ready", timer: input.timer };
}

export function buildFocusStartRequest(
  input: Readonly<{
    kind: "focus" | "break";
    mode: FocusModeView;
    focusPlannedSeconds: number;
    breakPlannedSeconds: number;
    link: FocusLinkView | null;
  }>,
): FocusStartRequest {
  if (input.kind === "break") {
    return {
      kind: "break",
      mode: "pomodoro",
      plannedSeconds: input.breakPlannedSeconds,
      taskId: null,
      habitId: null,
    };
  }
  const links = {
    taskId: input.link?.kind === "task" ? input.link.id : null,
    habitId: input.link?.kind === "habit" ? input.link.id : null,
  };
  return input.mode === "pomodoro"
    ? { kind: "focus", mode: "pomodoro", plannedSeconds: input.focusPlannedSeconds, ...links }
    : { kind: "focus", mode: "stopwatch", plannedSeconds: null, ...links };
}

export function focusMutationFailure(error: unknown): FocusConditionMarker {
  if (isFocusApiError(error) && error.code === "CONFLICT") {
    return {
      kind: "mutation-error",
      message: "The saved timer changed elsewhere. Refresh to use its authoritative state.",
    };
  }
  if (isFocusApiError(error) && error.code === "VALIDATION_FAILED") {
    return { kind: "mutation-error", message: error.message };
  }
  return {
    kind: "mutation-error",
    message: "The timer change was not confirmed. It may still be running on the server.",
  };
}

export function focusHistoryMutationFailure(error: unknown): string {
  if (isFocusApiError(error) && error.code === "CONFLICT") {
    return "The completed session changed elsewhere, and the latest history could not be loaded.";
  }
  if (isFocusApiError(error) && error.code === "VALIDATION_FAILED") return error.message;
  return "The history change was not confirmed. Refresh saved history before changing it again.";
}

function isPermissionError(error: unknown): boolean {
  return isFocusApiError(error) && (error.code === "UNAUTHENTICATED" || error.code === "FORBIDDEN");
}
