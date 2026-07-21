import type { ReminderKind } from "./reminder-form-policy";

export type ReminderSchedule =
  Readonly<{ kind: "all_day"; startAt: null }> | Readonly<{ kind: "timed"; startAt: string }> | null;

export type ReminderRecurrence = "none" | "active" | "dormant" | "ended" | "exhausted";

export function describeReminderDormancy({
  kind,
  recurrence,
  reminderInstantPassed,
  schedule,
  task,
}: Readonly<{
  kind: ReminderKind;
  recurrence: ReminderRecurrence;
  reminderInstantPassed: boolean;
  schedule: ReminderSchedule;
  task: Readonly<{ status: "open" | "completed" | "cancelled"; deleted: boolean }>;
}>): string | null {
  if (task.deleted) {
    return "The task is deleted. The saved reminder will resume only after restore, without catching up missed time.";
  }
  if (task.status !== "open") {
    return "The task is not open. The saved reminder will resume only after reopening, without catching up missed time.";
  }
  if (kind === "relative_start" && recurrence === "exhausted") {
    return "The recurrence has no future occurrence. Edit the series to resume this saved reminder; missed reminders will not be caught up.";
  }
  if (kind === "relative_start" && recurrence === "ended") {
    return "The recurrence has ended. Restart the series to resume this saved reminder; missed reminders will not be caught up.";
  }
  if (kind === "relative_start" && !schedule) {
    return "The task has no eligible start. Add a future schedule to resume this saved reminder; missed reminders will not be caught up.";
  }
  if (kind === "absolute" && reminderInstantPassed) {
    return "The reminder time has passed. Choose a future time to resume this saved reminder; the missed reminder will not be caught up.";
  }
  if (kind === "relative_start" && recurrence === "none" && reminderInstantPassed) {
    return "The reminder time has passed. Reschedule the task to resume this saved reminder; the missed reminder will not be caught up.";
  }
  return null;
}
