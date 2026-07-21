export type ProjectionTaskStatus = "open" | "completed" | "cancelled";
export type ProjectionTaskPriority = "none" | "low" | "medium" | "high";
export type ProjectionOccurrenceState = "open" | "completed" | "skipped";
export type ProjectionLifecycle = "one_off" | "recurring_occurrence" | "recurrence_summary";

export type ProjectionSchedule =
  | Readonly<{
      kind: "all_day";
      startDate: string;
      endDate: string;
    }>
  | Readonly<{
      kind: "timed";
      startAt: string;
      endAt: string;
      timezone: string;
    }>;

type ProjectionTaskFields = Readonly<{
  projectionId: string;
  taskId: string;
  listId: string;
  title: string;
  status: ProjectionTaskStatus;
  priority: ProjectionTaskPriority;
  rank: string;
  version: number;
  deletedAt: string | null;
  schedule: ProjectionSchedule | null;
}>;

export type OneOffProjectionTask = ProjectionTaskFields &
  Readonly<{
    projectionLifecycle: "one_off";
  }>;

export type RecurringOccurrenceProjectionTask = ProjectionTaskFields &
  Readonly<{
    projectionLifecycle: "recurring_occurrence";
    occurrenceKey: string;
    occurrenceState: ProjectionOccurrenceState;
    transitionEligible: boolean;
  }>;

export type RecurrenceSummaryProjectionTask = ProjectionTaskFields &
  Readonly<{
    projectionLifecycle: "recurrence_summary";
    recurrenceSummary: string;
  }>;

export type ProjectionSourceTask =
  OneOffProjectionTask | RecurringOccurrenceProjectionTask | RecurrenceSummaryProjectionTask;

export type OpenProjectionTask = ProjectionSourceTask & Readonly<{ status: "open" }>;

export type ScheduledProjectionTask = OpenProjectionTask & Readonly<{ schedule: ProjectionSchedule }>;
export type ScheduledOpenProjectionTask = OpenProjectionTask & Readonly<{ schedule: ProjectionSchedule }>;

/** Task-level open projections; completed/skipped occurrences remain visible for Calendar and Agenda. */
export function activeTaskProjections(rows: readonly ProjectionSourceTask[]): OpenProjectionTask[] {
  return rows.flatMap((row) => {
    if (row.status !== "open" || row.deletedAt !== null) return [];
    return [{ ...row, status: "open" as const }];
  });
}

/** Actionable rows only; terminal occurrence state never leaks into Today, Upcoming, or Matrix. */
export function activeOpenTasks(rows: readonly ProjectionSourceTask[]): OpenProjectionTask[] {
  return activeTaskProjections(rows).filter(
    (row) =>
      row.projectionLifecycle !== "recurring_occurrence" ||
      (row.occurrenceState === "open" && row.transitionEligible),
  );
}

export function activeOpenScheduledTasks(
  rows: readonly ProjectionSourceTask[],
): ScheduledOpenProjectionTask[] {
  return activeOpenTasks(rows).flatMap((row) =>
    row.schedule === null ? [] : [{ ...row, schedule: row.schedule }],
  );
}

export function activeScheduledTaskProjections(
  rows: readonly ProjectionSourceTask[],
): ScheduledProjectionTask[] {
  return activeTaskProjections(rows).flatMap((row) =>
    row.schedule === null ? [] : [{ ...row, schedule: row.schedule }],
  );
}
