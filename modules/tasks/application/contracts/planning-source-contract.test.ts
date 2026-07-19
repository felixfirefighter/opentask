import { describe, expect, it } from "vitest";

import { taskPlanningSourceQuerySchema } from "./planning-source-contract";

describe("task planning source contract", () => {
  it("accepts only the three bounded source modes", () => {
    expect(
      taskPlanningSourceQuerySchema.parse({
        kind: "scheduled_through",
        exclusiveEndDate: "2026-07-20",
        exclusiveEndAt: "2026-07-19T16:00:00Z",
        limit: 500,
      }),
    ).toMatchObject({ kind: "scheduled_through", limit: 500 });
    expect(taskPlanningSourceQuerySchema.parse({ kind: "all_open", limit: 1 })).toEqual({
      kind: "all_open",
      limit: 1,
    });
    expect(() => taskPlanningSourceQuerySchema.parse({ kind: "all_open", limit: 501 })).toThrow();
    expect(() =>
      taskPlanningSourceQuerySchema.parse({ kind: "all_open", limit: 50, userId: crypto.randomUUID() }),
    ).toThrow();
  });

  it("applies the canonical finite calendar-range cap", () => {
    const base = {
      kind: "scheduled_range" as const,
      rangeStartDate: "2026-07-01",
      rangeStartAt: "2026-06-30T16:00:00Z",
      rangeEndAt: "2026-09-01T16:00:00Z",
      limit: 250,
    };

    expect(() => taskPlanningSourceQuerySchema.parse({ ...base, rangeEndDate: "2026-09-03" })).toThrow(
      /62 local days/i,
    );
    expect(
      taskPlanningSourceQuerySchema.parse({
        ...base,
        rangeEndDate: "2026-09-01",
        rangeEndAt: "2026-08-31T16:00:00Z",
      }),
    ).toMatchObject({ kind: "scheduled_range" });
  });
});
