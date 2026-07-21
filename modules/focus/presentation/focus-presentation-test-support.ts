import type {
  FocusActiveView,
  FocusHistoryItemView,
  FocusLinkOption,
  FocusPresentationActions,
  FocusTimerView,
} from "./focus-screen-model";
import { BREAK_UI_DEFAULT_SECONDS, FOCUS_UI_DEFAULT_SECONDS } from "./focus-screen-model";

export const focusLinkOptions: readonly FocusLinkOption[] = [
  { id: "task-1", kind: "task", label: "Draft release notes", available: true },
  { id: "habit-1", kind: "habit", label: "Read for twenty minutes", available: true },
];

export function idleFocusTimer(overrides: Partial<Extract<FocusTimerView, { kind: "idle" }>> = {}) {
  return {
    kind: "idle",
    mode: "pomodoro",
    focusPlannedSeconds: FOCUS_UI_DEFAULT_SECONDS,
    breakPlannedSeconds: BREAK_UI_DEFAULT_SECONDS,
    link: null,
    ...overrides,
  } satisfies Extract<FocusTimerView, { kind: "idle" }>;
}

export function runningFocusTimer(overrides: Partial<Extract<FocusTimerView, { kind: "session" }>> = {}) {
  return {
    kind: "session",
    id: "focus-1",
    version: 1,
    phase: "focus",
    mode: "pomodoro",
    status: "running",
    displayedElapsedSeconds: 300,
    plannedSeconds: 1_500,
    link: focusLinkOptions[0] ?? null,
    ...overrides,
  } satisfies Extract<FocusTimerView, { kind: "session" }>;
}

export function readyFocusActive(timer: FocusTimerView = idleFocusTimer()): FocusActiveView {
  return { kind: "ready", timer };
}

export function focusHistoryItem(overrides: Partial<FocusHistoryItemView> = {}): FocusHistoryItemView {
  return {
    id: "history-1",
    version: 1,
    kind: "focus",
    mode: "pomodoro",
    completedAtLabel: "today at 10:30 AM",
    durationSeconds: 1_500,
    link: focusLinkOptions[0] ?? null,
    ...overrides,
  };
}

export function focusPresentationActions(
  overrides: Partial<FocusPresentationActions> = {},
): FocusPresentationActions {
  const noop = () => undefined;
  const confirm = async () => true;
  return {
    onModeChange: noop,
    onFocusDurationChange: noop,
    onBreakDurationChange: noop,
    onLinkChange: noop,
    onLinkSearch: noop,
    onStartFocus: noop,
    onStartBreak: noop,
    onPause: noop,
    onResume: noop,
    onFinish: noop,
    onDiscard: noop,
    onCorrect: confirm,
    onDelete: noop,
    onRetryActive: noop,
    onRetrySummary: noop,
    onRetryHistory: noop,
    ...overrides,
  };
}
