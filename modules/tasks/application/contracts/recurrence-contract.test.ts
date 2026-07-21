import { describe, expect, it } from "vitest";

import {
  editRecurringTaskScheduleRequestSchema,
  recurrenceCommandFailureSchema,
  recurrenceDefinitionSchema,
  recurrenceProjectionCutoverSchema,
  recurringTaskScheduleValueSchema,
  setTaskRecurrenceRequestSchema,
  taskRecurrenceDtoSchema,
  taskRecurrenceMutationResultSchema,
} from "./recurrence-contract";

const taskId = "11111111-1111-4111-8111-111111111111";
const timestamp = "2026-07-20T00:00:00Z";

describe("recurrence contracts", () => {
  it("accepts only the bounded typed preset and ending vocabulary", () => {
    const definitions = [
      { preset: { kind: "daily", interval: 1 }, end: { kind: "never" } },
      { preset: { kind: "weekdays", interval: 2 }, end: { kind: "count", count: 999 } },
      {
        preset: { kind: "weekly", interval: 99, weekdays: [1, 3, 7] },
        end: { kind: "until", untilDate: "2026-12-31" },
      },
      { preset: { kind: "monthly", interval: 1 }, end: { kind: "never" } },
      { preset: { kind: "yearly", interval: 1 }, end: { kind: "never" } },
    ];

    for (const definition of definitions) {
      expect(() => recurrenceDefinitionSchema.parse(definition)).not.toThrow();
    }
    expect(() =>
      recurrenceDefinitionSchema.parse({
        preset: { kind: "daily", interval: 100 },
        end: { kind: "never" },
      }),
    ).toThrow();
    expect(() =>
      recurrenceDefinitionSchema.parse({
        preset: { kind: "weekly", interval: 1, weekdays: [3, 1] },
        end: { kind: "never" },
      }),
    ).toThrow(/sorted/i);
    expect(() =>
      recurrenceDefinitionSchema.parse({
        preset: { kind: "weekly", interval: 1, weekdays: [1, 1] },
        end: { kind: "never" },
      }),
    ).toThrow(/unique/i);
    expect(() =>
      recurrenceDefinitionSchema.parse({
        preset: { kind: "daily", interval: 1, arbitraryRrule: "FREQ=SECONDLY" },
        end: { kind: "never" },
      }),
    ).toThrow();
  });

  it("keeps date and instant cutovers exclusive, ordered, and non-mixing", () => {
    expect(
      recurrenceProjectionCutoverSchema.parse({
        kind: "all_day",
        projectionStartDate: "2026-07-21",
        projectionEndDate: "2026-07-21",
      }),
    ).toMatchObject({ projectionEndDate: "2026-07-21" });
    expect(() =>
      recurrenceProjectionCutoverSchema.parse({
        kind: "all_day",
        projectionStartDate: "2026-07-21",
        projectionEndDate: "2026-07-20",
      }),
    ).toThrow();
    expect(() =>
      recurrenceProjectionCutoverSchema.parse({
        kind: "timed",
        projectionStartAt: "2026-07-20T09:00:00+08:00",
        projectionEndAt: "2026-07-20T00:30:00Z",
      }),
    ).toThrow();
    expect(() =>
      recurrenceProjectionCutoverSchema.parse({
        kind: "all_day",
        projectionStartDate: "2026-07-21",
        projectionEndDate: null,
        projectionEndAt: null,
      }),
    ).toThrow();
  });

  it("requires lifecycle state to agree with the optional upper cutover", () => {
    const base = {
      taskId,
      taskVersion: 3,
      generationMode: "schedule",
      timezone: "Asia/Singapore",
      definition: { preset: { kind: "daily", interval: 1 }, end: { kind: "never" } },
      createdAt: timestamp,
      updatedAt: timestamp,
    } as const;

    expect(() =>
      taskRecurrenceDtoSchema.parse({
        ...base,
        lifecycle: "active",
        cutover: {
          kind: "all_day",
          projectionStartDate: "2026-07-20",
          projectionEndDate: null,
        },
      }),
    ).not.toThrow();
    expect(() =>
      taskRecurrenceDtoSchema.parse({
        ...base,
        lifecycle: "ended",
        cutover: {
          kind: "all_day",
          projectionStartDate: "2026-07-21",
          projectionEndDate: "2026-07-21",
        },
      }),
    ).not.toThrow();
    expect(() =>
      taskRecurrenceDtoSchema.parse({
        ...base,
        lifecycle: "ended",
        cutover: {
          kind: "all_day",
          projectionStartDate: "2026-07-20",
          projectionEndDate: null,
        },
      }),
    ).toThrow(/upper projection cutover/i);
  });

  it("binds a recurrence mutation response to the owning task version", () => {
    const recurrence = {
      taskId,
      taskVersion: 3,
      generationMode: "schedule",
      timezone: "Asia/Singapore",
      definition: { preset: { kind: "daily", interval: 1 }, end: { kind: "never" } },
      cutover: {
        kind: "all_day",
        projectionStartDate: "2026-07-20",
        projectionEndDate: null,
      },
      lifecycle: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    } as const;
    expect(() =>
      taskRecurrenceMutationResultSchema.parse({ task: { id: taskId, version: 3 }, recurrence }),
    ).not.toThrow();
    expect(() =>
      taskRecurrenceMutationResultSchema.parse({
        task: { id: taskId, version: 4 },
        recurrence,
      }),
    ).toThrow(/identity and version/i);
  });

  it("enforces recurrence-only duration, alignment, and DST-fold eligibility", () => {
    expect(() =>
      recurringTaskScheduleValueSchema.parse({
        kind: "all_day",
        startDate: "2026-07-01",
        endDate: "2026-08-01",
      }),
    ).not.toThrow();
    expect(() =>
      recurringTaskScheduleValueSchema.parse({
        kind: "all_day",
        startDate: "2026-07-01",
        endDate: "2026-08-02",
      }),
    ).toThrow(/31.*days/i);
    expect(() =>
      recurringTaskScheduleValueSchema.parse({
        kind: "timed",
        startAt: "2026-07-20T09:00:30Z",
        endAt: "2026-07-20T10:00:00Z",
        timezone: "UTC",
      }),
    ).toThrow(/whole-minute/i);
    expect(() =>
      recurringTaskScheduleValueSchema.parse({
        kind: "timed",
        startAt: "2026-11-01T06:30:00Z",
        endAt: "2026-11-01T07:30:00Z",
        timezone: "America/New_York",
      }),
    ).toThrow(/later instant/i);
    expect(() =>
      recurringTaskScheduleValueSchema.parse({
        kind: "timed",
        startAt: "2026-11-01T05:30:00Z",
        endAt: "2026-11-01T06:30:00Z",
        timezone: "America/New_York",
      }),
    ).not.toThrow();
  });

  it("validates an atomic recurring schedule edit against its anchor", () => {
    const base = {
      expectedVersion: 4,
      schedule: { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-21" },
    } as const;
    expect(() =>
      editRecurringTaskScheduleRequestSchema.parse({
        ...base,
        definition: {
          preset: { kind: "weekly", interval: 1, weekdays: [1, 3] },
          end: { kind: "until", untilDate: "2026-07-20" },
        },
      }),
    ).not.toThrow();
    expect(() =>
      editRecurringTaskScheduleRequestSchema.parse({
        ...base,
        definition: {
          preset: { kind: "weekly", interval: 1, weekdays: [2] },
          end: { kind: "never" },
        },
      }),
    ).toThrow(/anchor/i);
    expect(() =>
      editRecurringTaskScheduleRequestSchema.parse({
        ...base,
        definition: {
          preset: { kind: "daily", interval: 1 },
          end: { kind: "until", untilDate: "2026-07-19" },
        },
      }),
    ).toThrow(/end date/i);
  });

  it("requires expected versions and keeps command failures discriminated", () => {
    expect(
      setTaskRecurrenceRequestSchema.parse({
        expectedVersion: 7,
        definition: { preset: { kind: "daily", interval: 1 }, end: { kind: "never" } },
      }),
    ).toMatchObject({ expectedVersion: 7 });
    expect(() =>
      setTaskRecurrenceRequestSchema.parse({
        definition: { preset: { kind: "daily", interval: 1 }, end: { kind: "never" } },
      }),
    ).toThrow();
    expect(
      recurrenceCommandFailureSchema.parse({
        reason: "stale_version",
        code: "CONFLICT",
        currentVersion: 8,
      }),
    ).toEqual({ reason: "stale_version", code: "CONFLICT", currentVersion: 8 });
    expect(() =>
      recurrenceCommandFailureSchema.parse({
        reason: "stale_version",
        code: "CONFLICT",
      }),
    ).toThrow();
  });
});
