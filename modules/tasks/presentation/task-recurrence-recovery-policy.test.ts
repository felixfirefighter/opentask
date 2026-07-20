import { describe, expect, it } from "vitest";

import type { TaskRecurrenceDto } from "../application/contracts/recurrence-contract";
import { recurrenceAttemptMatches, snapshotTaskSchedule } from "./task-recurrence-recovery-policy";

const definition = {
  preset: { kind: "monthly", interval: 1 },
  end: { kind: "never" },
} as const;

describe("recurrence conflict recovery policy", () => {
  it("does not mistake a concurrent schedule restart for the user's recurrence attempt", () => {
    expect(
      recurrenceAttemptMatches({
        attempt: "save",
        attemptedDefinition: definition,
        attemptedSchedule: allDaySchedule("2026-07-20", "2026-07-21"),
        expectedVersion: 1,
        recurrence: recurrence({ taskVersion: 2 }),
        schedule: allDaySchedule("2026-07-21", "2026-07-22"),
      }),
    ).toBe(false);
  });

  it("recognizes a response-lost save only when both the definition and schedule still match", () => {
    const schedule = allDaySchedule("2026-07-20", "2026-07-21");
    expect(
      recurrenceAttemptMatches({
        attempt: "save",
        attemptedDefinition: definition,
        attemptedSchedule: snapshotTaskSchedule(schedule),
        expectedVersion: 1,
        recurrence: recurrence({ taskVersion: 2 }),
        schedule,
      }),
    ).toBe(true);
  });
});

function allDaySchedule(startDate: string, endDate: string) {
  return { kind: "all_day", startDate, endDate } as const;
}

function recurrence(overrides: Partial<TaskRecurrenceDto> = {}): TaskRecurrenceDto {
  return {
    taskId: "00000000-0000-4000-8000-000000000010",
    taskVersion: 1,
    generationMode: "schedule",
    timezone: "Asia/Singapore",
    definition,
    cutover: {
      kind: "all_day",
      projectionStartDate: "2026-07-20",
      projectionEndDate: null,
    },
    lifecycle: "active",
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    ...overrides,
  };
}
