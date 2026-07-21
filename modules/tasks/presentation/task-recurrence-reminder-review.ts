export type TaskRecurrenceReminderReview = Readonly<{
  status: "loading" | "ready" | "unavailable";
  absoluteReminderVersion: number | null;
  refresh: () => Promise<void>;
}>;

async function noopRefresh() {}

export const noTaskRecurrenceReminderReview: TaskRecurrenceReminderReview = Object.freeze({
  status: "ready",
  absoluteReminderVersion: null,
  refresh: noopRefresh,
});
