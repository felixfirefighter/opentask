import { describe, expect, it } from "vitest";

import {
  addLocalDays,
  assertAllDayScheduleBounds,
  assertScheduleQueryBounds,
  assertTimedScheduleBounds,
} from "./schedule-bounds";

describe("schedule bounds", () => {
  it("requires at least one local day for an all-day schedule", () => {
    expect(() => assertAllDayScheduleBounds("2026-07-19", "2026-07-20")).not.toThrow();
    expect(() => assertAllDayScheduleBounds("2026-07-19", "2026-07-19")).toThrow(RangeError);
    expect(() => assertAllDayScheduleBounds("2026-07-20", "2026-07-19")).toThrow(RangeError);
  });

  it("permits a timed point but not a reversed timed interval", () => {
    expect(() => assertTimedScheduleBounds("2026-07-19T09:00:00Z", "2026-07-19T09:00:00Z")).not.toThrow();
    expect(() => assertTimedScheduleBounds("2026-07-19T09:00:00Z", "2026-07-19T10:00:00Z")).not.toThrow();
    expect(() => assertTimedScheduleBounds("2026-07-19T10:00:00Z", "2026-07-19T09:00:00Z")).toThrow(
      RangeError,
    );
  });

  it("uses calendar-day arithmetic rather than fixed 24-hour instants", () => {
    expect(addLocalDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addLocalDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("caps both local-day and elapsed-instant query work", () => {
    expect(() =>
      assertScheduleQueryBounds("2026-07-01", "2026-09-01", "2026-07-01T00:00:00Z", "2026-09-01T00:00:00Z"),
    ).not.toThrow();
    expect(() =>
      assertScheduleQueryBounds("2026-07-01", "2026-09-02", "2026-07-01T00:00:00Z", "2026-07-02T00:00:00Z"),
    ).toThrow(/62 local days/);
    expect(() =>
      assertScheduleQueryBounds("2026-07-01", "2026-07-02", "2026-07-01T00:00:00Z", "2026-09-04T00:00:00Z"),
    ).toThrow(/instant range is too large/);
  });
});
