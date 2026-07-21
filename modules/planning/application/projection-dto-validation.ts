import { z } from "zod";

import { PLANNING_PROJECTION_MAX_ROWS } from "./projection-query-contract";
import {
  oneOffProjectionId,
  recurrenceSummaryProjectionId,
  recurringOccurrenceProjectionId,
} from "./projection-identity";

export const RECURRENCE_DRAG_DISABLED_REASON =
  "Recurring occurrences must be edited through the series schedule.";
export const RECURRENCE_MATRIX_EMPTY_SUMMARY = "No occurrence in the next 62 days";

type ProjectionLifecycle = "one_off" | "recurring_occurrence" | "recurrence_summary";

type ProjectionMetadata = Readonly<{
  taskId: string;
  projectionId: string;
  projectionLifecycle: ProjectionLifecycle;
  occurrenceKey: string | null;
  occurrenceState: "open" | "completed" | "skipped" | null;
  transitionEligible: boolean | null;
  recurrenceSummary: string | null;
  scheduleInteraction: Readonly<{
    editScope: "task" | "series";
    dragEnabled: boolean;
    dragDisabledReason: string | null;
  }>;
}>;

export function validatePlanningTaskMetadata(
  value: Omit<ProjectionMetadata, "taskId"> & Readonly<{ id: string; schedule: unknown | null }>,
  context: z.RefinementCtx,
) {
  validateProjectionMetadata({ ...value, taskId: value.id }, context);
  if (value.projectionLifecycle === "recurring_occurrence" && value.schedule === null) {
    context.addIssue({ code: "custom", path: ["schedule"], message: "An occurrence must be scheduled." });
  }
  if (value.projectionLifecycle === "recurrence_summary" && value.schedule !== null) {
    context.addIssue({
      code: "custom",
      path: ["schedule"],
      message: "A recurrence summary cannot expose the root schedule as an occurrence.",
    });
  }
}

export function validateCalendarEventMetadata(value: ProjectionMetadata, context: z.RefinementCtx) {
  validateProjectionMetadata(value, context);
  if (value.projectionLifecycle === "recurrence_summary") {
    context.addIssue({ code: "custom", message: "A recurrence summary cannot be a Calendar event." });
  }
}

export function validateUniqueProjectionRows(
  rows: readonly Readonly<{ projectionId: string }>[],
  surface: string,
  context: z.RefinementCtx,
) {
  if (rows.length > PLANNING_PROJECTION_MAX_ROWS) {
    context.addIssue({
      code: "custom",
      message: `A ${surface} projection cannot exceed ${PLANNING_PROJECTION_MAX_ROWS} rows.`,
    });
  }
  if (new Set(rows.map((row) => row.projectionId)).size !== rows.length) {
    context.addIssue({ code: "custom", message: `${surface} projection identities must be unique.` });
  }
}

export function unicodeBoundedString(maximum: number) {
  return z
    .string()
    .trim()
    .min(1)
    .refine((value) => Array.from(value).length <= maximum, {
      message: `Must contain at most ${maximum} Unicode characters.`,
    });
}

function validateProjectionMetadata(value: ProjectionMetadata, context: z.RefinementCtx) {
  const recurrenceInteraction =
    value.scheduleInteraction.editScope === "series" &&
    !value.scheduleInteraction.dragEnabled &&
    value.scheduleInteraction.dragDisabledReason === RECURRENCE_DRAG_DISABLED_REASON;

  if (value.projectionLifecycle === "one_off") {
    if (
      value.projectionId !== oneOffProjectionId(value.taskId) ||
      value.occurrenceKey !== null ||
      value.occurrenceState !== null ||
      value.transitionEligible !== null ||
      value.recurrenceSummary !== null ||
      value.scheduleInteraction.editScope !== "task" ||
      !value.scheduleInteraction.dragEnabled ||
      value.scheduleInteraction.dragDisabledReason !== null
    ) {
      context.addIssue({ code: "custom", message: "The one-off projection metadata is inconsistent." });
    }
    return;
  }

  if (value.projectionLifecycle === "recurring_occurrence") {
    if (
      value.occurrenceKey === null ||
      value.occurrenceState === null ||
      value.transitionEligible === null ||
      value.recurrenceSummary !== null ||
      value.projectionId !== recurringOccurrenceProjectionId(value.taskId, value.occurrenceKey) ||
      !recurrenceInteraction
    ) {
      context.addIssue({ code: "custom", message: "The recurring occurrence metadata is inconsistent." });
    }
    return;
  }

  if (
    value.projectionId !== recurrenceSummaryProjectionId(value.taskId) ||
    value.occurrenceKey !== null ||
    value.occurrenceState !== null ||
    value.transitionEligible !== null ||
    value.recurrenceSummary !== RECURRENCE_MATRIX_EMPTY_SUMMARY ||
    !recurrenceInteraction
  ) {
    context.addIssue({ code: "custom", message: "The recurrence summary metadata is inconsistent." });
  }
}
