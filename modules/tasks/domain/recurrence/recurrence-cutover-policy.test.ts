import { describe, expect, it } from "vitest";

import {
  assertRecurrenceProjectionWindow,
  endRecurrenceProjection,
  fallbackEndCutover,
  initialRecurrenceProjection,
  occurrenceStartsStrictlyAfterNow,
  occurrenceStartsWithinProjection,
  restartRecurrenceProjection,
  type RecurrenceProjectionWindow,
} from "./recurrence-cutover-policy";

describe("recurrence projection cutovers", () => {
  it("starts at the canonical anchor with no upper cutover", () => {
    expect(
      initialRecurrenceProjection({
        kind: "all_day",
        startDate: "2026-07-20",
        endDate: "2026-07-21",
        timezone: "UTC",
      }),
    ).toEqual({
      kind: "all_day",
      projectionStartDate: "2026-07-20",
      projectionEndDate: null,
    });
    expect(
      initialRecurrenceProjection({
        kind: "timed",
        startAt: "2026-07-20T01:00:00Z",
        endAt: "2026-07-20T02:00:00Z",
        timezone: "UTC",
      }),
    ).toEqual({
      kind: "timed",
      projectionStartAt: "2026-07-20T01:00:00Z",
      projectionEndAt: null,
    });
  });

  it("treats the lower cutover as inclusive and the upper cutover as exclusive", () => {
    const window = {
      kind: "all_day",
      projectionStartDate: "2026-07-20",
      projectionEndDate: "2026-07-22",
    } satisfies RecurrenceProjectionWindow;
    expect(occurrenceStartsWithinProjection(window, { kind: "all_day", startDate: "2026-07-19" })).toBe(
      false,
    );
    expect(occurrenceStartsWithinProjection(window, { kind: "all_day", startDate: "2026-07-20" })).toBe(true);
    expect(occurrenceStartsWithinProjection(window, { kind: "all_day", startDate: "2026-07-22" })).toBe(
      false,
    );
  });

  it("permits upper equal to lower as an explicitly empty ended projection", () => {
    const ended = endRecurrenceProjection(
      { kind: "timed", projectionStartAt: "2026-07-20T01:00:00Z", projectionEndAt: null },
      { kind: "timed", startAt: "2026-07-20T01:00:00Z" },
    );
    expect(ended).toEqual({
      kind: "timed",
      projectionStartAt: "2026-07-20T01:00:00Z",
      projectionEndAt: "2026-07-20T01:00:00Z",
    });
    expect(occurrenceStartsWithinProjection(ended, { kind: "timed", startAt: "2026-07-20T01:00:00Z" })).toBe(
      false,
    );
  });

  it("clears an old upper cutover on explicit restart", () => {
    expect(
      restartRecurrenceProjection(
        {
          kind: "all_day",
          projectionStartDate: "2026-07-20",
          projectionEndDate: "2026-08-01",
        },
        { kind: "all_day", startDate: "2026-08-03" },
      ),
    ).toEqual({
      kind: "all_day",
      projectionStartDate: "2026-08-03",
      projectionEndDate: null,
    });
  });

  it("rejects mismatched kinds and an upper cutover before the lower cutover", () => {
    expect(() =>
      endRecurrenceProjection(
        { kind: "all_day", projectionStartDate: "2026-07-20", projectionEndDate: null },
        { kind: "timed", startAt: "2026-07-21T00:00:00Z" },
      ),
    ).toThrow(RangeError);
    expect(() =>
      assertRecurrenceProjectionWindow({
        kind: "timed",
        projectionStartAt: "2026-07-20T01:00:00Z",
        projectionEndAt: "2026-07-20T00:59:59Z",
      }),
    ).toThrow(RangeError);
  });

  it("uses tomorrow in the series zone or authoritative now when no future end candidate exists", () => {
    expect(fallbackEndCutover("all_day", "2026-07-20T17:00:00Z", "Asia/Singapore")).toEqual({
      kind: "all_day",
      startDate: "2026-07-22",
    });
    expect(fallbackEndCutover("timed", "2026-07-20T17:00:00.123Z", "UTC")).toEqual({
      kind: "timed",
      startAt: "2026-07-20T17:00:00.123Z",
    });
  });

  it("defines future relative to the local day for all-day and the instant for timed", () => {
    expect(
      occurrenceStartsStrictlyAfterNow(
        { kind: "all_day", startDate: "2026-07-21" },
        "2026-07-20T17:00:00Z",
        "Asia/Singapore",
      ),
    ).toBe(false);
    expect(
      occurrenceStartsStrictlyAfterNow(
        { kind: "all_day", startDate: "2026-07-22" },
        "2026-07-20T17:00:00Z",
        "Asia/Singapore",
      ),
    ).toBe(true);
    expect(
      occurrenceStartsStrictlyAfterNow(
        { kind: "timed", startAt: "2026-07-20T17:00:00.001Z" },
        "2026-07-20T17:00:00Z",
        "UTC",
      ),
    ).toBe(true);
  });
});
