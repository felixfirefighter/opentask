import { describe, expect, it } from "vitest";

import type { RecurrenceRule } from "./recurrence-policy";
import { parseRecurrenceRule, serializeRecurrenceRule } from "./recurrence-codec";
import type { RecurrenceScheduleAnchor } from "./recurrence-time-policy";

const january31: RecurrenceScheduleAnchor = {
  kind: "all_day",
  startDate: "2026-08-31",
  endDate: "2026-09-01",
  timezone: "UTC",
};

describe("canonical recurrence rule codec", () => {
  it.each([
    [{ preset: { kind: "daily", interval: 2 }, end: { kind: "never" } }, "FREQ=DAILY;INTERVAL=2"],
    [
      { preset: { kind: "weekdays", interval: 3 }, end: { kind: "count", count: 9 } },
      "FREQ=WEEKLY;INTERVAL=3;WKST=MO;BYDAY=MO,TU,WE,TH,FR;COUNT=9",
    ],
    [
      { preset: { kind: "monthly", interval: 1 }, end: { kind: "until", untilDate: "2026-12-31" } },
      "FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=31;UNTIL=20261231",
    ],
  ] satisfies readonly (readonly [RecurrenceRule, string])[])(
    "serializes and parses %s",
    (rule, expected) => {
      expect(serializeRecurrenceRule(rule, january31)).toBe(expected);
      expect(parseRecurrenceRule(expected, january31)).toEqual(rule);
    },
  );

  it("uses the anchor month and day for yearly recurrence", () => {
    const leapAnchor: RecurrenceScheduleAnchor = {
      kind: "all_day",
      startDate: "2024-02-29",
      endDate: "2024-03-01",
      timezone: "UTC",
    };
    const rule = {
      preset: { kind: "yearly", interval: 2 },
      end: { kind: "count", count: 4 },
    } satisfies RecurrenceRule;
    const serialized = "FREQ=YEARLY;INTERVAL=2;BYMONTH=2;BYMONTHDAY=29;COUNT=4";
    expect(serializeRecurrenceRule(rule, leapAnchor)).toBe(serialized);
    expect(parseRecurrenceRule(serialized, leapAnchor)).toEqual(rule);
  });

  it("normalizes selected Monday-Friday to the equivalent weekdays preset", () => {
    const serialized = serializeRecurrenceRule(
      { preset: { kind: "weekly", interval: 1, weekdays: [1, 2, 3, 4, 5] }, end: { kind: "never" } },
      january31,
    );
    expect(parseRecurrenceRule(serialized, january31)).toEqual({
      preset: { kind: "weekdays", interval: 1 },
      end: { kind: "never" },
    });
  });

  it.each([
    "RRULE:FREQ=DAILY;INTERVAL=1",
    "freq=daily;interval=1",
    "FREQ=DAILY;INTERVAL=1\nCOUNT=2",
    "FREQ=DAILY;INTERVAL=1;DTSTART=20260131",
    "FREQ=DAILY;INTERVAL=1;RDATE=20260201",
    "INTERVAL=1;FREQ=DAILY",
    "FREQ=DAILY;INTERVAL=01",
    "FREQ=DAILY;INTERVAL=1;COUNT=2;UNTIL=20261231",
  ])("rejects unsafe, unsupported, or noncanonical stored text: %s", (serialized) => {
    expect(() => parseRecurrenceRule(serialized, january31)).toThrow(RangeError);
  });

  it("rejects monthly/yearly fields that diverge from the schedule anchor", () => {
    expect(() => parseRecurrenceRule("FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=30", january31)).toThrow(RangeError);
    expect(() => parseRecurrenceRule("FREQ=YEARLY;INTERVAL=1;BYMONTH=2;BYMONTHDAY=1", january31)).toThrow(
      RangeError,
    );
  });
});
