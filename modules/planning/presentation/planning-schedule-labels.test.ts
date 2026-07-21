import { describe, expect, it } from "vitest";

import { formatDetailedOccurrenceScheduleLabel } from "./planning-schedule-labels";

describe("planning occurrence schedule labels", () => {
  it("keeps a same-day timed occurrence concise", () => {
    expect(
      formatDetailedOccurrenceScheduleLabel(
        {
          kind: "timed",
          startAt: "2026-07-20T01:00:00.000Z",
          endAt: "2026-07-20T02:00:00.000Z",
          timezone: "Asia/Singapore",
        },
        "Asia/Singapore",
        "12",
      ),
    ).toBe("Monday, July 20, 9:00 AM–10:00 AM");
  });

  it("names both local dates across midnight and a DST boundary", () => {
    expect(
      formatDetailedOccurrenceScheduleLabel(
        {
          kind: "timed",
          startAt: "2026-11-01T03:30:00.000Z",
          endAt: "2026-11-01T06:30:00.000Z",
          timezone: "America/New_York",
        },
        "America/New_York",
        "12",
      ),
    ).toBe("Saturday, October 31, 11:30 PM–Sunday, November 1, 1:30 AM");
  });

  it("converts an exclusive all-day end to the complete inclusive range", () => {
    expect(
      formatDetailedOccurrenceScheduleLabel(
        { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-23" },
        "Asia/Singapore",
        "12",
      ),
    ).toBe("Monday, July 20–Wednesday, July 22 · Anytime");
  });
});
