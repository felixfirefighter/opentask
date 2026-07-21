import { describe, expect, it } from "vitest";

import type { PlanningProjectionTruncationReason } from "../application/public";
import { resolvePlanningProjectionCondition } from "./planning-projection-condition";

describe("planning projection presentation condition", () => {
  it.each([
    ["recurrence_source_limit", "recurrence history loading"],
    ["recurrence_event_source_limit", "recurrence history loading"],
    ["recurrence_series_candidate_limit", "recurrence calculation"],
    ["recurrence_request_candidate_limit", "recurrence calculation"],
    ["recurrence_output_limit", "result loading"],
  ] as const)("explains %s as an honest read-only partial view", (reason, copy) => {
    const condition = resolvePlanningProjectionCondition(
      { kind: "ready" },
      { truncated: true, truncationReasons: [reason] },
    );

    expect(condition).toMatchObject({ kind: "partial", reasons: [reason], runtimeCondition: null });
    expect(condition.kind === "partial" && condition.message).toContain(copy);
    expect(condition.kind === "partial" && condition.message).toContain("may be missing");
    expect(condition.kind === "partial" && condition.message).toContain("read-only");
  });

  it("preserves a non-truncated ready view and higher-priority runtime conditions", () => {
    expect(
      resolvePlanningProjectionCondition({ kind: "ready" }, { truncated: false, truncationReasons: [] }),
    ).toEqual({ kind: "ready" });

    const reasons: readonly PlanningProjectionTruncationReason[] = ["projection_output_limit"];
    const offlinePartial = resolvePlanningProjectionCondition(
      { kind: "offline" },
      { truncated: true, truncationReasons: reasons },
    );
    expect(offlinePartial).toMatchObject({
      kind: "partial",
      reasons,
      runtimeCondition: { kind: "offline" },
    });
    expect(
      resolvePlanningProjectionCondition(
        { kind: "ready" },
        { truncated: true, truncationReasons: reasons },
        { kind: "date-changed", currentDateLabel: "Tuesday, July 21" },
      ),
    ).toMatchObject({
      kind: "partial",
      runtimeCondition: { kind: "date-changed", currentDateLabel: "Tuesday, July 21" },
    });
  });

  it.each([
    [{ kind: "offline" } as const, "offline"],
    [{ kind: "error", message: "Refresh failed." } as const, "error"],
    [{ kind: "conflict", message: "Changed elsewhere." } as const, "conflict"],
  ])("preserves a %s runtime condition alongside known partial metadata", (base, runtimeKind) => {
    expect(
      resolvePlanningProjectionCondition(base, {
        truncated: true,
        truncationReasons: ["recurrence_source_limit"],
      }),
    ).toMatchObject({
      kind: "partial",
      reasons: ["recurrence_source_limit"],
      runtimeCondition: { kind: runtimeKind },
    });
  });
});
