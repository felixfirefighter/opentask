import { describe, expect, it } from "vitest";

import { isEligibleOccurrence } from "./occurrence-projection-support";
import { createOccurrenceKey, decodeOccurrenceKey } from "../domain/recurrence/occurrence-key";
import { initialRecurrenceProjection } from "../domain/recurrence/recurrence-cutover-policy";
import type { RecurrenceRule } from "../domain/recurrence/recurrence-policy";
import {
  projectRecurrenceCandidate,
  type LocalRecurrenceStart,
  type RecurrenceScheduleAnchor,
} from "../domain/recurrence/recurrence-time-policy";

const taskId = "20000000-0000-4000-8000-000000000001";
const dailyRule = {
  preset: { kind: "daily", interval: 1 },
  end: { kind: "never" },
} as const satisfies RecurrenceRule;

describe("occurrence command eligibility", () => {
  it("returns false for a decoded kind that does not match the series", () => {
    const anchor = allDayAnchor("2026-07-20");
    const timedKey = createOccurrenceKey(taskId, {
      kind: "timed",
      startAt: "2026-07-20T00:00:00Z",
    });

    expect(
      isEligibleOccurrence({
        rule: dailyRule,
        anchor,
        projection: initialRecurrenceProjection(anchor),
        decoded: decodeOccurrenceKey(timedKey, taskId),
      }),
    ).toBe(false);
  });

  it("round-trips a spring-gap projection through its opaque key", () => {
    const anchor = timedAnchor("2026-03-07T07:30:00Z", "2026-03-07T08:30:00Z", "America/New_York");
    const candidate = { kind: "timed", startLocalDateTime: "2026-03-08T02:30" } as const;
    const projected = projectRecurrenceCandidate(anchor, candidate);

    expect(projected).toMatchObject({ kind: "timed", startAt: "2026-03-08T07:30:00Z" });
    expect(eligibleRoundTrip(anchor, candidate)).toBe(true);
    expect(eligibleInstant(anchor, "2026-03-08T08:30:00Z")).toBe(false);
  });

  it("accepts only the earlier instant of a fall-fold projection", () => {
    const anchor = timedAnchor("2026-10-31T05:30:00Z", "2026-10-31T06:30:00Z", "America/New_York");
    const candidate = { kind: "timed", startLocalDateTime: "2026-11-01T01:30" } as const;
    const projected = projectRecurrenceCandidate(anchor, candidate);

    expect(projected).toMatchObject({ kind: "timed", startAt: "2026-11-01T05:30:00Z" });
    expect(eligibleRoundTrip(anchor, candidate)).toBe(true);
    expect(eligibleInstant(anchor, "2026-11-01T06:30:00Z")).toBe(false);
  });
});

function eligibleRoundTrip(anchor: RecurrenceScheduleAnchor, candidate: LocalRecurrenceStart): boolean {
  const projected = projectRecurrenceCandidate(anchor, candidate);
  if (projected.kind !== "timed") throw new Error("Expected a timed projection.");
  return eligibleInstant(anchor, projected.startAt);
}

function eligibleInstant(anchor: RecurrenceScheduleAnchor, startAt: string): boolean {
  const key = createOccurrenceKey(taskId, { kind: "timed", startAt });
  return isEligibleOccurrence({
    rule: dailyRule,
    anchor,
    projection: initialRecurrenceProjection(anchor),
    decoded: decodeOccurrenceKey(key, taskId),
  });
}

function allDayAnchor(startDate: string): RecurrenceScheduleAnchor {
  return {
    kind: "all_day",
    startDate,
    endDate: "2026-07-21",
    timezone: "UTC",
  };
}

function timedAnchor(startAt: string, endAt: string, timezone: string): RecurrenceScheduleAnchor {
  return { kind: "timed", startAt, endAt, timezone };
}
