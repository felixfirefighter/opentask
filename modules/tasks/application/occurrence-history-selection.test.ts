import { describe, expect, it } from "vitest";

import { selectPotentiallyOverlappingHistoricalEvents } from "./occurrence-history-selection";
import { createOccurrenceKey } from "../domain/recurrence/occurrence-key";

const allDayTaskId = "10000000-0000-4000-8000-000000000001";
const timedTaskId = "20000000-0000-4000-8000-000000000001";
const query = {
  rangeStartDate: "2026-08-18",
  rangeEndDate: "2026-08-19",
  rangeStartAt: "2026-08-18T01:00:00.000Z",
  rangeEndAt: "2026-08-18T02:00:00.000Z",
  limit: 50,
} as const;

describe("historical occurrence event selection", () => {
  it("uses strict 31-day calendar padding for all-day occurrence starts", () => {
    const atPaddedStart = event(
      allDayTaskId,
      createOccurrenceKey(allDayTaskId, { kind: "all_day", startDate: "2026-07-18" }),
    );
    const afterPaddedStart = event(
      allDayTaskId,
      createOccurrenceKey(allDayTaskId, { kind: "all_day", startDate: "2026-07-19" }),
    );
    const atRangeEnd = event(
      allDayTaskId,
      createOccurrenceKey(allDayTaskId, { kind: "all_day", startDate: "2026-08-19" }),
    );

    const selected = selectPotentiallyOverlappingHistoricalEvents(
      [atPaddedStart, afterPaddedStart, atRangeEnd],
      query,
    );

    expect(selected).toEqual([
      {
        event: afterPaddedStart,
        decoded: {
          taskId: allDayTaskId,
          kind: "all_day",
          startDate: "2026-07-19",
        },
      },
    ]);
  });

  it("uses strict 31-day exact elapsed padding for timed occurrence starts", () => {
    const atPaddedStart = event(
      timedTaskId,
      createOccurrenceKey(timedTaskId, { kind: "timed", startAt: "2026-07-18T01:00:00.000Z" }),
    );
    const afterPaddedStart = event(
      timedTaskId,
      createOccurrenceKey(timedTaskId, { kind: "timed", startAt: "2026-07-18T01:01:00.000Z" }),
    );
    const atRangeEnd = event(
      timedTaskId,
      createOccurrenceKey(timedTaskId, { kind: "timed", startAt: "2026-08-18T02:00:00.000Z" }),
    );

    const selected = selectPotentiallyOverlappingHistoricalEvents(
      [atPaddedStart, afterPaddedStart, atRangeEnd],
      query,
    );

    expect(selected).toEqual([
      {
        event: afterPaddedStart,
        decoded: {
          taskId: timedTaskId,
          kind: "timed",
          epochMilliseconds: 1_784_336_460_000,
          startAt: "2026-07-18T01:01:00Z",
        },
      },
    ]);
  });
});

function event(taskId: string, occurrenceKey: string) {
  return { taskId, occurrenceKey };
}
