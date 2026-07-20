import { z } from "zod";

import type { PlanningOccurrenceTruncationReason } from "./planning-source-reader";

const projectionTruncationReasonValues = [
  "task_source_limit",
  "recurrence_source_limit",
  "recurrence_event_source_limit",
  "recurrence_series_candidate_limit",
  "recurrence_request_candidate_limit",
  "recurrence_output_limit",
  "projection_output_limit",
] as const;

export const planningProjectionTruncationReasonSchema = z.enum(projectionTruncationReasonValues);

export type PlanningProjectionTruncationReason = z.infer<typeof planningProjectionTruncationReasonSchema>;

export const planningProjectionTruncationFields = {
  truncated: z.boolean(),
  truncationReasons: z
    .array(planningProjectionTruncationReasonSchema)
    .max(projectionTruncationReasonValues.length),
} as const;

export function validatePlanningProjectionTruncation(
  value: Readonly<{
    truncated: boolean;
    truncationReasons: readonly PlanningProjectionTruncationReason[];
  }>,
  context: z.RefinementCtx,
) {
  if (value.truncated !== value.truncationReasons.length > 0) {
    context.addIssue({
      code: "custom",
      path: ["truncationReasons"],
      message: "Planning projection truncation metadata is inconsistent.",
    });
  }
  if (new Set(value.truncationReasons).size !== value.truncationReasons.length) {
    context.addIssue({
      code: "custom",
      path: ["truncationReasons"],
      message: "Planning projection truncation reasons must be unique.",
    });
  }
}

export function buildPlanningProjectionTruncation(
  input: Readonly<{
    occurrenceReasonGroups?: readonly (readonly PlanningOccurrenceTruncationReason[])[];
    projectionOutputTruncated?: boolean;
    taskSourceTruncated?: boolean;
  }>,
) {
  const reasons = new Set<PlanningProjectionTruncationReason>();
  if (input.taskSourceTruncated) reasons.add("task_source_limit");
  for (const group of input.occurrenceReasonGroups ?? []) {
    for (const reason of group) reasons.add(occurrenceReasonMap[reason]);
  }
  if (input.projectionOutputTruncated) reasons.add("projection_output_limit");

  const truncationReasons = projectionTruncationReasonValues.filter((reason) => reasons.has(reason));
  return { truncated: truncationReasons.length > 0, truncationReasons } as const;
}

const occurrenceReasonMap: Readonly<
  Record<PlanningOccurrenceTruncationReason, PlanningProjectionTruncationReason>
> = {
  source_limit: "recurrence_source_limit",
  event_source_limit: "recurrence_event_source_limit",
  series_candidate_limit: "recurrence_series_candidate_limit",
  request_candidate_limit: "recurrence_request_candidate_limit",
  output_limit: "recurrence_output_limit",
};
