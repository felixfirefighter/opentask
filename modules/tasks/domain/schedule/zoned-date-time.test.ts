import { describe, expect, it } from "vitest";

import {
  instantToLocalDate,
  instantToLocalDateTime,
  localDateStartToInstant,
  localDateTimeToInstant,
  resolveLocalDateTime,
  timezoneOffsetMinutesAt,
} from "./zoned-date-time";

describe("IANA timezone conversion", () => {
  it("round-trips a normal local time without consulting the process timezone", () => {
    const instant = localDateTimeToInstant("2026-07-19T09:30", "Asia/Singapore");
    expect(instant).toBe("2026-07-19T01:30:00Z");
    expect(instantToLocalDateTime(instant, "Asia/Singapore")).toBe("2026-07-19T09:30:00");
    expect(instantToLocalDate(instant, "Asia/Singapore")).toBe("2026-07-19");
    expect(localDateStartToInstant("2026-07-19", "Asia/Singapore")).toBe("2026-07-18T16:00:00Z");
  });

  it("identifies the America/New_York spring-forward gap and requires explicit disambiguation", () => {
    expect(resolveLocalDateTime("2026-03-08T02:30", "America/New_York")).toEqual({
      kind: "gap",
      earlierInstant: "2026-03-08T06:30:00Z",
      laterInstant: "2026-03-08T07:30:00Z",
    });
    expect(() => localDateTimeToInstant("2026-03-08T02:30", "America/New_York")).toThrow(RangeError);
    expect(localDateTimeToInstant("2026-03-08T02:30", "America/New_York", "later")).toBe(
      "2026-03-08T07:30:00Z",
    );
  });

  it("identifies both America/New_York fall-back instants instead of choosing silently", () => {
    expect(resolveLocalDateTime("2026-11-01T01:30", "America/New_York")).toEqual({
      kind: "fold",
      earlierInstant: "2026-11-01T05:30:00Z",
      laterInstant: "2026-11-01T06:30:00Z",
    });
    expect(() => localDateTimeToInstant("2026-11-01T01:30", "America/New_York")).toThrow(RangeError);
    expect(localDateTimeToInstant("2026-11-01T01:30", "America/New_York", "earlier")).toBe(
      "2026-11-01T05:30:00Z",
    );
    expect(localDateTimeToInstant("2026-11-01T01:30", "America/New_York", "later")).toBe(
      "2026-11-01T06:30:00Z",
    );
  });

  it("reports the zone offset at an explicit instant", () => {
    expect(timezoneOffsetMinutesAt(new Date("2026-03-08T06:30:00Z"), "America/New_York")).toBe(-300);
    expect(timezoneOffsetMinutesAt(new Date("2026-03-08T07:30:00Z"), "America/New_York")).toBe(-240);
  });
});
