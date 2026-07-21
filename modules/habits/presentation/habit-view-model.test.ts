import { describe, expect, it } from "vitest";

import { habitDay } from "./habit-presentation-test-support";
import {
  compactLocalDay,
  fullLocalDate,
  habitDayStatusLabel,
  habitScheduleLabel,
  habitStreakLabel,
  monthLabel,
} from "./habit-view-model";

describe("habit view model", () => {
  it("formats local dates in UTC so the stored day cannot drift", () => {
    expect(fullLocalDate("2026-07-20")).toBe("Monday, July 20, 2026");
    expect(compactLocalDay("2026-07-20")).toEqual({ day: "M", date: "20" });
    expect(monthLabel("2026-07")).toBe("July 2026");
  });

  it("keeps schedule and streak meaning available as text", () => {
    expect(
      habitScheduleLabel({
        kind: "weekdays",
        weekdays: [1, 3, 5],
        targetPerWeek: null,
        timezone: "Asia/Singapore",
        startDate: "2026-07-01",
        endDate: null,
      }),
    ).toBe("Monday, Wednesday, Friday · from Jul 1");
    expect(
      habitStreakLabel({
        habitId: "3db2d92f-4a43-4e9d-a772-29a13fa59d93",
        cadence: "week",
        current: 1,
        best: 4,
        evaluatedThrough: "2026-07-20",
      }),
    ).toBe("Current 1 week · Best 4 weeks");
  });

  it("includes numeric quantities and units in accessible status labels", () => {
    expect(
      habitDayStatusLabel(
        habitDay("2026-07-20", {
          status: "partial",
          log: {
            id: "58c0417d-b5dd-47e1-a71d-8a07903898c8",
            habitId: "3db2d92f-4a43-4e9d-a772-29a13fa59d93",
            localDate: "2026-07-20",
            state: "completed",
            quantity: 1.25,
            note: null,
            successful: false,
            version: 1,
            createdAt: "2026-07-20T01:00:00.000Z",
            updatedAt: "2026-07-20T01:00:00.000Z",
          },
        }),
        "litres",
      ),
    ).toBe("Recorded, 1.25 litres, below target");
  });

  it("does not expose a preserved historical quantity after the current goal becomes boolean", () => {
    expect(
      habitDayStatusLabel(
        habitDay("2026-07-20", {
          status: "successful",
          log: {
            id: "58c0417d-b5dd-47e1-a71d-8a07903898c8",
            habitId: "3db2d92f-4a43-4e9d-a772-29a13fa59d93",
            localDate: "2026-07-20",
            state: "completed",
            quantity: 12,
            note: null,
            successful: true,
            version: 2,
            createdAt: "2026-07-20T01:00:00.000Z",
            updatedAt: "2026-07-20T02:00:00.000Z",
          },
        }),
        null,
      ),
    ).toBe("Completed");
  });
});
