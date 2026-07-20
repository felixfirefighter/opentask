import { describe, expect, it } from "vitest";

import { buildPlanningProjectionTruncation } from "./projection-truncation";

describe("planning projection truncation", () => {
  it.each([
    ["source_limit", "recurrence_source_limit"],
    ["event_source_limit", "recurrence_event_source_limit"],
    ["series_candidate_limit", "recurrence_series_candidate_limit"],
    ["request_candidate_limit", "recurrence_request_candidate_limit"],
    ["output_limit", "recurrence_output_limit"],
  ] as const)("preserves the recurrence %s reason as %s", (sourceReason, projectionReason) => {
    expect(buildPlanningProjectionTruncation({ occurrenceReasonGroups: [[sourceReason]] })).toEqual({
      truncated: true,
      truncationReasons: [projectionReason],
    });
  });

  it("deduplicates reasons in stable contract order across Matrix reads", () => {
    expect(
      buildPlanningProjectionTruncation({
        taskSourceTruncated: true,
        occurrenceReasonGroups: [
          ["output_limit", "source_limit"],
          ["source_limit", "request_candidate_limit"],
        ],
        projectionOutputTruncated: true,
      }),
    ).toEqual({
      truncated: true,
      truncationReasons: [
        "task_source_limit",
        "recurrence_source_limit",
        "recurrence_request_candidate_limit",
        "recurrence_output_limit",
        "projection_output_limit",
      ],
    });
  });

  it("returns explicit non-truncated metadata when no safety cap was reached", () => {
    expect(buildPlanningProjectionTruncation({ occurrenceReasonGroups: [[]] })).toEqual({
      truncated: false,
      truncationReasons: [],
    });
  });
});
