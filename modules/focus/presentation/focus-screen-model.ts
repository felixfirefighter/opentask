export const FOCUS_UI_DEFAULT_SECONDS = 1_500;
export const BREAK_UI_DEFAULT_SECONDS = 300;

export type FocusModeView = "pomodoro" | "stopwatch";
export type FocusPendingAction =
  "start-focus" | "start-break" | "pause" | "resume" | "finish" | "discard" | "correct" | "delete";

export type FocusLinkView = Readonly<{
  id: string;
  kind: "task" | "habit";
  label: string | null;
  available: boolean;
}>;

export type FocusLinkOption = Readonly<{
  id: string;
  kind: "task" | "habit";
  label: string;
  available: true;
}>;

export type FocusLinkSearchView = Readonly<{
  query: string;
  options: readonly FocusLinkOption[];
  status: "idle" | "loading" | "ready" | "error";
}>;

export type FocusTimerView =
  | Readonly<{
      kind: "idle";
      mode: FocusModeView;
      focusPlannedSeconds: number;
      breakPlannedSeconds: number;
      link: FocusLinkView | null;
    }>
  | Readonly<{
      kind: "session";
      id: string;
      version: number;
      phase: "focus" | "break";
      mode: FocusModeView;
      status: "running" | "paused";
      displayedElapsedSeconds: number;
      plannedSeconds: number | null;
      link: FocusLinkView | null;
    }>;

export type FocusActiveView =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "permission" }>
  | Readonly<{ kind: "ready"; timer: FocusTimerView }>
  | Readonly<{ kind: "offline"; timer: FocusTimerView }>
  | Readonly<{ kind: "read-stale"; message: string; timer: FocusTimerView }>
  | Readonly<{ kind: "reconnect"; message: string; timer: FocusTimerView }>
  | Readonly<{ kind: "conflict"; message: string; timer: FocusTimerView }>
  | Readonly<{ kind: "mutation-error"; message: string; timer: FocusTimerView }>;

export type FocusSummaryView =
  | Readonly<{ kind: "loading" }>
  | Readonly<{
      kind: "error";
      message: string;
      cached?: Readonly<{ todaySeconds: number; sevenDaySeconds: number }>;
    }>
  | Readonly<{ kind: "ready"; todaySeconds: number; sevenDaySeconds: number }>;

export type FocusHistoryItemView = Readonly<{
  id: string;
  version: number;
  kind: "focus" | "break";
  mode: FocusModeView;
  completedAtLabel: string;
  durationSeconds: number;
  link: FocusLinkView | null;
}>;

export type FocusCorrectionView = Readonly<{
  durationSeconds: number;
  link?: Readonly<{ id: string; kind: "task" | "habit" }> | null;
}>;

export type FocusHistoryView =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "ready"; items: readonly FocusHistoryItemView[] }>
  | Readonly<{
      kind: "error";
      message: string;
      title?: string;
      items?: readonly FocusHistoryItemView[];
    }>;

export type FocusPresentationActions = Readonly<{
  onModeChange: (mode: FocusModeView) => void;
  onFocusDurationChange: (seconds: number) => void;
  onBreakDurationChange: (seconds: number) => void;
  onLinkChange: (link: FocusLinkView | null) => void;
  onLinkSearch: (query: string) => void;
  onStartFocus: () => void;
  onStartBreak: () => void;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onDiscard: () => void;
  onCorrect: (sessionId: string, correction: FocusCorrectionView) => Promise<boolean>;
  onDelete: (sessionId: string) => void;
  onRetryActive: () => void;
  onRetrySummary: () => void;
  onRetryHistory: () => void;
}>;

export function focusWritesDisabled(active: FocusActiveView): boolean {
  switch (active.kind) {
    case "ready":
    case "reconnect":
    case "conflict":
      return false;
    default:
      return true;
  }
}
