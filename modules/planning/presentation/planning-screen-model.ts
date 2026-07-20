import type { PlanningProjectionTruncationReason } from "../application/public";

export type PlanningPriority = "none" | "low" | "medium" | "high";
export type PlanningTaskStatus = "open" | "completed" | "cancelled";
export type PlanningCategory = "coral" | "amber" | "mint" | "sky" | "violet" | "slate";
export type PlanningProjectionLifecycle = "one_off" | "recurring_occurrence" | "recurrence_summary";
export type PlanningOccurrenceState = "open" | "completed" | "skipped";
export type PlanningOccurrenceAction = "complete" | "skip" | "undo";
export type PlanningScheduleInteraction = Readonly<{
  editScope: "task" | "series";
  dragEnabled: boolean;
  dragDisabledReason: string | null;
}>;

export type PlanningTaskRowModel = Readonly<{
  projectionId: string;
  taskId: string;
  title: string;
  detailsHref: string;
  status: PlanningTaskStatus;
  priority: PlanningPriority;
  projectionLifecycle: PlanningProjectionLifecycle;
  occurrenceKey: string | null;
  occurrenceState: PlanningOccurrenceState | null;
  recurrenceSummary: string | null;
  scheduleInteraction: PlanningScheduleInteraction;
  scheduleLabel: string;
  contextLabel?: string | undefined;
  category?: PlanningCategory | undefined;
  conflicted?: boolean | undefined;
}>;

export type PlanningTaskActions = Readonly<{
  onOpenTask?: ((taskId: string) => void) | undefined;
  onStatusChange?: ((taskId: string, status: PlanningTaskStatus) => void) | undefined;
  onOccurrenceTransition?:
    | ((
        taskId: string,
        occurrenceKey: string,
        action: PlanningOccurrenceAction,
        projectionId?: string,
      ) => void)
    | undefined;
  onPriorityChange?: ((taskId: string, priority: PlanningPriority) => void) | undefined;
  onEditSchedule?: ((taskId: string) => void) | undefined;
  onEditSeriesSchedule?: ((taskId: string) => void) | undefined;
}>;

export type PlanningRecoverableCondition =
  | Readonly<{ kind: "error"; message?: string | undefined }>
  | Readonly<{ kind: "offline" }>
  | Readonly<{ kind: "conflict"; message?: string | undefined }>
  | Readonly<{ kind: "date-changed"; currentDateLabel: string }>;

export type PlanningScreenCondition =
  | Readonly<{ kind: "ready" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{
      kind: "partial";
      message: string;
      reasons: readonly PlanningProjectionTruncationReason[];
      runtimeCondition: PlanningRecoverableCondition | null;
    }>
  | Readonly<{ kind: "permission" }>
  | PlanningRecoverableCondition;

export type QuickAddTokenModel = Readonly<{
  id: string;
  label: string;
  warning?: string | undefined;
}>;

export type QuickAddModel = Readonly<{
  announcement?: string | undefined;
  errorMessage?: string | undefined;
  placeholder?: string | undefined;
  value: string;
  tokens?: readonly QuickAddTokenModel[] | undefined;
  destinationLabel: string;
  retryLocked?: boolean | undefined;
  submitting?: boolean | undefined;
}>;

export type TodayPlanningModel = Readonly<{
  localDateLabel: string;
  localWeekdayLabel: string;
  timeZoneLabel: string;
  remainingLabel: string;
  overdue: readonly PlanningTaskRowModel[];
  timed: readonly PlanningTaskRowModel[];
  anytime: readonly PlanningTaskRowModel[];
}>;

export type UpcomingGroupModel = Readonly<{
  id: string;
  dateLabel: string;
  tasks: readonly PlanningTaskRowModel[];
}>;

export type UpcomingPlanningModel = Readonly<{
  rangeLabel: string;
  timeZoneLabel: string;
  totalLabel: string;
  groups: readonly UpcomingGroupModel[];
}>;

export type CalendarView = "month" | "week" | "day" | "agenda";

export type PlanningCalendarEventModel = Readonly<{
  projectionId: string;
  taskId: string;
  title: string;
  detailsHref: string;
  start: string;
  end: string;
  allDay: boolean;
  projectionLifecycle: PlanningProjectionLifecycle;
  occurrenceKey: string | null;
  occurrenceState: PlanningOccurrenceState | null;
  recurrenceSummary: string | null;
  scheduleInteraction: PlanningScheduleInteraction;
  scheduleLabel: string;
  statusLabel: string;
  categoryLabel: string;
  category: PlanningCategory;
  conflicted?: boolean | undefined;
}>;

export type CalendarPlanningModel = Readonly<{
  view: CalendarView;
  hasSavedView: boolean;
  initialDate: string;
  rangeLabel: string;
  timeZone: string;
  timeZoneLabel: string;
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  hourCycle: "12" | "24";
  events: readonly PlanningCalendarEventModel[];
  selectedEventId?: string | null | undefined;
}>;

export type VisibleCalendarRange = Readonly<{
  start: string;
  end: string;
  view: CalendarView;
}>;

export type CalendarEventChange = Readonly<{
  taskId: string;
  start: string;
  end: string;
  allDay: boolean;
}>;

export type CalendarChangeResult =
  | Readonly<{ ok: true; announcement?: string | undefined }>
  | Readonly<{ ok: false; message: string; conflict?: boolean | undefined }>;

export type ScheduleSaveOutcome = "saved" | "failed" | "unconfirmed";

export type MatrixQuadrantId = "do-now" | "plan" | "time-sensitive" | "later";

export type MatrixQuadrantModel = Readonly<{
  id: MatrixQuadrantId;
  title: string;
  ruleLabel: string;
  tasks: readonly PlanningTaskRowModel[];
  category: PlanningCategory;
}>;

export type MatrixPlanningModel = Readonly<{
  boundaryLabel: string;
  quadrants: Readonly<{
    doNow: MatrixQuadrantModel & Readonly<{ id: "do-now" }>;
    plan: MatrixQuadrantModel & Readonly<{ id: "plan" }>;
    timeSensitive: MatrixQuadrantModel & Readonly<{ id: "time-sensitive" }>;
    later: MatrixQuadrantModel & Readonly<{ id: "later" }>;
  }>;
  announcement?: string | undefined;
}>;
