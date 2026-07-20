import { dueBoundary, instantEpochNanoseconds } from "./local-time-policy";
import type { ProjectionSourceTask, RecurringOccurrenceProjectionTask } from "./projection-model";

/**
 * Replaces each recurrence-root summary with its earliest eligible open occurrence.
 * Rows are de-duplicated by the composite task/occurrence projection identity because a long
 * occurrence can be returned by both independently capped Matrix reads.
 */
export function selectMatrixRecurrenceRows(
  allOpenRows: readonly ProjectionSourceTask[],
  overlapRows: readonly ProjectionSourceTask[],
  forwardRows: readonly ProjectionSourceTask[],
  input: Readonly<{ todayStartAt: string; timeZone: string }>,
): readonly ProjectionSourceTask[] {
  const todayStart = instantEpochNanoseconds(input.todayStartAt);
  const occurrences = new Map<string, RecurringOccurrenceProjectionTask>();

  for (const row of overlapRows) {
    if (
      row.projectionLifecycle !== "recurring_occurrence" ||
      row.occurrenceState !== "open" ||
      !row.transitionEligible ||
      row.schedule === null
    ) {
      continue;
    }
    if (dueBoundary(row.schedule, input.timeZone) <= todayStart) continue;
    occurrences.set(row.projectionId, row);
  }
  for (const row of forwardRows) {
    if (
      row.projectionLifecycle === "recurring_occurrence" &&
      row.occurrenceState === "open" &&
      row.transitionEligible &&
      row.schedule !== null
    ) {
      occurrences.set(row.projectionId, row);
    }
  }

  const earliestByTask = new Map<string, RecurringOccurrenceProjectionTask>();
  for (const occurrence of occurrences.values()) {
    const current = earliestByTask.get(occurrence.taskId);
    if (current === undefined || compareOccurrence(occurrence, current, input.timeZone) < 0) {
      earliestByTask.set(occurrence.taskId, occurrence);
    }
  }

  return allOpenRows.map((row) => {
    if (row.projectionLifecycle !== "recurrence_summary") return row;
    return earliestByTask.get(row.taskId) ?? row;
  });
}

function compareOccurrence(
  left: RecurringOccurrenceProjectionTask,
  right: RecurringOccurrenceProjectionTask,
  timeZone: string,
): number {
  if (left.schedule === null || right.schedule === null) {
    throw new Error("A Matrix recurrence occurrence must be scheduled.");
  }
  const leftDue = dueBoundary(left.schedule, timeZone);
  const rightDue = dueBoundary(right.schedule, timeZone);
  if (leftDue !== rightDue) return leftDue < rightDue ? -1 : 1;
  return left.projectionId.localeCompare(right.projectionId);
}
