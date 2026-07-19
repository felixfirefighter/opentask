export type ProjectionTaskStatus = "open" | "completed" | "cancelled";
export type ProjectionTaskPriority = "none" | "low" | "medium" | "high";

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

export type ProjectionSourceTask = Readonly<{
  id: string;
  listId: string;
  title: string;
  status: ProjectionTaskStatus;
  priority: ProjectionTaskPriority;
  rank: string;
  version: number;
  deletedAt: string | null;
  schedule: ProjectionSchedule | null;
}>;

export type OpenProjectionTask = Omit<ProjectionSourceTask, "status" | "deletedAt"> &
  Readonly<{ status: "open" }>;

export type ScheduledOpenProjectionTask = Omit<OpenProjectionTask, "schedule"> &
  Readonly<{ schedule: ProjectionSchedule }>;

export function activeOpenTasks(rows: readonly ProjectionSourceTask[]): OpenProjectionTask[] {
  return rows.flatMap((row) => {
    if (row.status !== "open" || row.deletedAt !== null) {
      return [];
    }

    return [{ ...row, status: "open" as const }];
  });
}

export function activeOpenScheduledTasks(
  rows: readonly ProjectionSourceTask[],
): ScheduledOpenProjectionTask[] {
  return activeOpenTasks(rows).flatMap((row) =>
    row.schedule === null ? [] : [{ ...row, schedule: row.schedule }],
  );
}
