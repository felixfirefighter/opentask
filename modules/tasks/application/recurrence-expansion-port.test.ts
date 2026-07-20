import { describe, expect, it } from "vitest";

import { RruleRecurrenceExpander } from "../infrastructure/recurrence/rrule-expander";
import type { RecurrenceExpansionPort } from "./recurrence-expansion-port";

describe("recurrence expansion port", () => {
  it("keeps the provider adapter structurally replaceable", () => {
    const port: RecurrenceExpansionPort = new RruleRecurrenceExpander();
    expect(
      port.next({
        rule: { preset: { kind: "daily", interval: 1 }, end: { kind: "count", count: 2 } },
        anchor: {
          kind: "all_day",
          startDate: "2026-07-20",
          endDate: "2026-07-21",
          timezone: "UTC",
        },
        after: { kind: "all_day", startDate: "2026-07-20" },
      }),
    ).toEqual({ kind: "all_day", startDate: "2026-07-21" });
  });
});
