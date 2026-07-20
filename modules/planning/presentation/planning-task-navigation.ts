export type PlanningTaskDetailsOptions = Readonly<{
  editSeriesSchedule?: boolean | undefined;
  occurrenceKey?: string | null | undefined;
  returnTo?: string | null | undefined;
}>;

export function planningTaskDetailsHref(taskId: string, options: PlanningTaskDetailsOptions = {}) {
  const query = new URLSearchParams();
  if (options.returnTo) query.set("returnTo", options.returnTo);
  if (options.occurrenceKey) query.set("occurrence", options.occurrenceKey);
  if (options.editSeriesSchedule) query.set("edit", "series-schedule");
  const serialized = query.toString();
  return serialized ? `/tasks/${taskId}?${serialized}` : `/tasks/${taskId}`;
}
