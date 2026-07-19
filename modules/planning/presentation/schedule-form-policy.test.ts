import { describe, expect, it } from "vitest";

import {
  initialScheduleForm,
  localDateForInstant,
  midpointLocalDate,
  nextLocalDate,
  scheduleFromForm,
} from "./schedule-form-policy";

describe("canonical schedule form policy", () => {
  it("keeps all-day values as local dates without UTC conversion", () => {
    const values = initialScheduleForm(
      { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-22" },
      "2026-07-19",
      "Asia/Singapore",
    );

    expect(scheduleFromForm(values, "Asia/Singapore")).toEqual({
      kind: "all_day",
      startDate: "2026-07-20",
      endDate: "2026-07-22",
    });
    expect(nextLocalDate("2026-12-31")).toBe("2027-01-01");
  });

  it("round-trips timed values through the explicitly saved IANA timezone", () => {
    const values = initialScheduleForm(
      {
        kind: "timed",
        startAt: "2026-07-20T01:00:00Z",
        endAt: "2026-07-20T02:30:00Z",
        timezone: "Asia/Singapore",
      },
      "2026-07-19",
      "Asia/Singapore",
    );

    expect(values).toMatchObject({ startLocal: "2026-07-20T09:00", endLocal: "2026-07-20T10:30" });
    expect(scheduleFromForm(values, "Asia/Singapore")).toEqual({
      kind: "timed",
      startAt: "2026-07-20T01:00:00Z",
      endAt: "2026-07-20T02:30:00Z",
      timezone: "Asia/Singapore",
    });
  });

  it("validates order and derives calendar helper dates deterministically", () => {
    expect(() =>
      scheduleFromForm(
        {
          allDay: true,
          startDate: "2026-07-20",
          endDate: "2026-07-20",
          startLocal: "2026-07-20T09:00",
          endLocal: "2026-07-20T10:00",
        },
        "UTC",
      ),
    ).toThrow("End date must be after start date");
    expect(localDateForInstant("2026-07-19T17:00:00Z", "Asia/Singapore")).toBe("2026-07-20");
    expect(midpointLocalDate("2026-07-01", "2026-08-01")).toBe("2026-07-16");
  });

  it("rejects daylight-saving gaps and repeated local times instead of choosing silently", () => {
    const timedValues = {
      allDay: false,
      startDate: "2026-03-08",
      endDate: "2026-03-09",
      startLocal: "2026-03-08T02:30",
      endLocal: "2026-03-08T03:30",
    } as const;

    expect(() => scheduleFromForm(timedValues, "America/New_York")).toThrow(
      "Daylight-saving gaps or repeated times must be adjusted",
    );
    expect(() =>
      scheduleFromForm(
        {
          ...timedValues,
          startDate: "2026-11-01",
          endDate: "2026-11-02",
          startLocal: "2026-11-01T01:30",
          endLocal: "2026-11-01T02:30",
        },
        "America/New_York",
      ),
    ).toThrow("Daylight-saving gaps or repeated times must be adjusted");
  });
});
