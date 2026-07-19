import { describe, expect, it } from "vitest";

import { defaultTimedSchedule, localValueToInstant, scheduleToLocalValue } from "./planner-schedule-edit";

describe("planner schedule local-time editing", () => {
  it("round-trips a valid local minute in its IANA timezone", () => {
    const instant = localValueToInstant("2026-03-08T03:30", "America/New_York");

    expect(instant).toBe("2026-03-08T07:30:00Z");
    expect(scheduleToLocalValue(instant!, "America/New_York")).toBe("2026-03-08T03:30");
  });

  it.each(["2026-03-08T02:30", "2026-11-01T01:30"])(
    "rejects the skipped or repeated local minute %s",
    (value) => {
      expect(localValueToInstant(value, "America/New_York")).toBeNull();
    },
  );

  it("builds a valid default timed block without changing its local wall times", () => {
    expect(
      defaultTimedSchedule({
        planningDate: "2026-03-08",
        timeZone: "America/New_York",
        workWindowStart: "03:30",
        durationMinutes: 30,
      }),
    ).toEqual({
      kind: "timed",
      startAt: "2026-03-08T07:30:00Z",
      endAt: "2026-03-08T08:00:00Z",
      timeZone: "America/New_York",
    });
  });

  it.each([
    ["2026-03-08", "02:30"],
    ["2026-11-01", "01:30"],
  ])("rejects a default block whose entered start is skipped or repeated", (planningDate, start) => {
    expect(
      defaultTimedSchedule({
        planningDate,
        timeZone: "America/New_York",
        workWindowStart: start,
        durationMinutes: 30,
      }),
    ).toBeNull();
  });

  it.each([
    ["2026-03-08", "01:30", "2026-03-08T06:30:00Z", "2026-03-08T07:30:00Z"],
    ["2026-11-01", "00:30", "2026-11-01T04:30:00Z", "2026-11-01T05:30:00Z"],
  ])(
    "keeps default duration elapsed-time based across a DST transition on %s",
    (planningDate, start, startAt, endAt) => {
      expect(
        defaultTimedSchedule({
          planningDate,
          timeZone: "America/New_York",
          workWindowStart: start,
          durationMinutes: 60,
        }),
      ).toEqual({ kind: "timed", startAt, endAt, timeZone: "America/New_York" });
    },
  );
});
