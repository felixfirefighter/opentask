import { describe, expect, it } from "vitest";

import {
  assertHabitTimeZone,
  canonicalHabitLocalDate,
  habitIsoWeekEnd,
  habitIsoWeekStart,
  localDateAtInstant,
} from "./habit-time-policy";

describe("habit local time policy", () => {
  it("derives local days through the New York spring gap and fall fold", () => {
    expect(localDateAtInstant("2026-03-08T04:59:00Z", "America/New_York")).toBe("2026-03-07");
    expect(localDateAtInstant("2026-03-08T07:30:00Z", "America/New_York")).toBe("2026-03-08");
    expect(localDateAtInstant("2026-11-01T05:30:00Z", "America/New_York")).toBe("2026-11-01");
    expect(localDateAtInstant("2026-11-01T06:30:00Z", "America/New_York")).toBe("2026-11-01");
  });

  it("derives calendar dates independently for Singapore and UTC", () => {
    expect(localDateAtInstant("2026-07-20T16:30:00Z", "Asia/Singapore")).toBe("2026-07-21");
    expect(localDateAtInstant("2026-07-20T16:30:00Z", "UTC")).toBe("2026-07-20");
  });

  it("uses ISO Monday-Sunday weeks across calendar-year boundaries", () => {
    expect(habitIsoWeekStart("2026-01-01")).toBe("2025-12-29");
    expect(habitIsoWeekEnd("2026-01-01")).toBe("2026-01-04");
    expect(habitIsoWeekStart("2027-01-03")).toBe("2026-12-28");
    expect(habitIsoWeekEnd("2027-01-03")).toBe("2027-01-03");
  });

  it("rejects aliases, offset zones, malformed dates, and invalid instants", () => {
    expect(() => assertHabitTimeZone("UTC")).not.toThrow();
    expect(() => assertHabitTimeZone("Asia/Singapore")).not.toThrow();
    for (const timezone of ["US/Eastern", "+08:00", "Mars/Olympus", ""]) {
      expect(() => assertHabitTimeZone(timezone)).toThrow(RangeError);
    }
    expect(() => canonicalHabitLocalDate("2026-7-1")).toThrow(RangeError);
    expect(() => canonicalHabitLocalDate("2026-02-29")).toThrow(RangeError);
    expect(() => canonicalHabitLocalDate("0000-01-01")).toThrowError(/between 0001-01-01/i);
    expect(canonicalHabitLocalDate("0001-01-01")).toBe("0001-01-01");
    expect(canonicalHabitLocalDate("9999-12-31")).toBe("9999-12-31");
    expect(() => localDateAtInstant("not-an-instant", "UTC")).toThrow(RangeError);
  });
});
