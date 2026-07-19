import { describe, expect, it } from "vitest";

import { reviewedPlanBatchSchema } from "./reviewed-plan-write-contract";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

describe("reviewed plan task-write contract", () => {
  it("accepts only create and bounded task-field/schedule updates", () => {
    expect(
      reviewedPlanBatchSchema.parse({
        creates: [
          {
            id: firstId,
            title: "Created task",
            descriptionMd: "",
            priority: "high",
            schedule: null,
          },
        ],
        updates: [
          {
            id: secondId,
            expectedVersion: 3,
            priority: "medium",
            schedule: { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-21" },
          },
        ],
      }),
    ).toMatchObject({ creates: [{ id: firstId }], updates: [{ id: secondId }] });

    for (const forbidden of [
      { status: "completed" },
      { deletedAt: "2026-07-19T00:00:00Z" },
      { listId: secondId },
    ]) {
      expect(() =>
        reviewedPlanBatchSchema.parse({
          creates: [],
          updates: [{ id: firstId, expectedVersion: 1, priority: "high", ...forbidden }],
        }),
      ).toThrow();
    }
  });

  it("rejects duplicate targets and empty update patches", () => {
    expect(() =>
      reviewedPlanBatchSchema.parse({
        creates: [{ id: firstId, title: "New", descriptionMd: "", priority: "none", schedule: null }],
        updates: [{ id: firstId, expectedVersion: 1, priority: "high" }],
      }),
    ).toThrow(/each task only once/i);
    expect(() =>
      reviewedPlanBatchSchema.parse({
        creates: [],
        updates: [{ id: firstId, expectedVersion: 1 }],
      }),
    ).toThrow(/at least one field/i);
  });
});
