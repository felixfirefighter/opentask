import { describe, expect, it } from "vitest";

import type { FocusSummarySource } from "./focus-summary-policy";
import {
  createFocusSummaryWindow,
  deriveFocusSummary,
  deriveFocusSummaryFromDailyTotals,
} from "./focus-summary-policy";

describe("focus summary policy", () => {
  it("uses the saved timezone and end instant for today plus the prior six local dates", () => {
    const summary = deriveFocusSummary(
      [
        completed("focus", "2026-07-20T16:30:00.000Z", 600),
        completed("focus", "2026-07-20T15:59:59.000Z", 300),
        completed("focus", "2026-07-14T16:00:00.000Z", 120),
        completed("focus", "2026-07-13T16:00:00.000Z", 9_999),
        completed("break", "2026-07-20T17:00:00.000Z", 900),
        { kind: "focus", state: "active", endedAt: null, accumulatedActiveSeconds: 50_000 },
      ],
      "Asia/Singapore",
      new Date("2026-07-21T12:00:00.000Z"),
    );

    expect(summary).toEqual({
      timezone: "Asia/Singapore",
      todayLocalDate: "2026-07-21",
      todaySeconds: 600,
      sevenDaySeconds: 1_020,
      days: [
        { localDate: "2026-07-15", totalSeconds: 120 },
        { localDate: "2026-07-16", totalSeconds: 0 },
        { localDate: "2026-07-17", totalSeconds: 0 },
        { localDate: "2026-07-18", totalSeconds: 0 },
        { localDate: "2026-07-19", totalSeconds: 0 },
        { localDate: "2026-07-20", totalSeconds: 300 },
        { localDate: "2026-07-21", totalSeconds: 600 },
      ],
    });
  });

  it("keeps end-instant membership deterministic across a DST fall-back", () => {
    const summary = deriveFocusSummary(
      [
        completed("focus", "2026-11-01T05:30:00.000Z", 60),
        completed("focus", "2026-11-01T06:30:00.000Z", 90),
      ],
      "America/New_York",
      new Date("2026-11-02T12:00:00.000Z"),
    );
    expect(summary.days.at(-2)).toEqual({ localDate: "2026-11-01", totalSeconds: 150 });
    expect(summary.todayLocalDate).toBe("2026-11-02");
  });

  it("builds exact saved-zone query bounds and fills aggregate gaps", () => {
    const window = createFocusSummaryWindow("America/New_York", new Date("2026-11-02T12:00:00.000Z"));
    expect(window).toMatchObject({
      todayLocalDate: "2026-11-02",
      localDates: [
        "2026-10-27",
        "2026-10-28",
        "2026-10-29",
        "2026-10-30",
        "2026-10-31",
        "2026-11-01",
        "2026-11-02",
      ],
    });
    expect(window.startAt.toISOString()).toBe("2026-10-27T04:00:00.000Z");
    expect(window.endAt.toISOString()).toBe("2026-11-03T05:00:00.000Z");
    expect(
      deriveFocusSummaryFromDailyTotals(
        [
          { localDate: "2026-11-01", totalSeconds: 150 },
          { localDate: "2026-11-02", totalSeconds: 300 },
        ],
        window,
      ),
    ).toMatchObject({ todaySeconds: 300, sevenDaySeconds: 450 });
  });

  it("rejects malformed completed rows and invalid saved zones", () => {
    expect(() =>
      deriveFocusSummary(
        [{ kind: "focus", state: "completed", endedAt: null, accumulatedActiveSeconds: 60 }],
        "UTC",
        new Date("2026-07-21T00:00:00.000Z"),
      ),
    ).toThrow(/end time/);
    expect(() => deriveFocusSummary([], "Not/A_Zone", new Date("2026-07-21T00:00:00.000Z"))).toThrow(
      /timezone/,
    );
  });
});

function completed(
  kind: "focus" | "break",
  endedAt: string,
  accumulatedActiveSeconds: number,
): FocusSummarySource {
  return {
    kind,
    state: "completed",
    endedAt: new Date(endedAt),
    accumulatedActiveSeconds,
  };
}
