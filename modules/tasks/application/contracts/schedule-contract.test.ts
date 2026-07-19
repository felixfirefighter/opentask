import { describe, expect, it } from "vitest";

import {
  quickAddParseResultSchema,
  setTaskScheduleRequestSchema,
  taskScheduleDtoSchema,
  taskScheduleRangeQuerySchema,
} from "./schedule-contract";

const taskId = "11111111-1111-4111-8111-111111111111";

describe("schedule contracts", () => {
  it("keeps the all-day and timed DTO representations closed and separate", () => {
    expect(
      taskScheduleDtoSchema.parse({
        taskId,
        kind: "all_day",
        startDate: "2026-07-19",
        endDate: "2026-07-20",
        createdAt: "2026-07-19T00:00:00Z",
        updatedAt: "2026-07-19T00:00:00Z",
      }),
    ).toMatchObject({ kind: "all_day", startDate: "2026-07-19", endDate: "2026-07-20" });

    expect(
      taskScheduleDtoSchema.parse({
        taskId,
        kind: "timed",
        startAt: "2026-07-19T09:00:00+08:00",
        endAt: "2026-07-19T09:00:00+08:00",
        timezone: "Asia/Singapore",
        createdAt: "2026-07-19T00:00:00Z",
        updatedAt: "2026-07-19T00:00:00Z",
      }),
    ).toMatchObject({ kind: "timed", timezone: "Asia/Singapore" });

    expect(() =>
      taskScheduleDtoSchema.parse({
        taskId,
        kind: "all_day",
        startDate: "2026-07-19",
        endDate: "2026-07-20",
        timezone: "UTC",
        createdAt: "2026-07-19T00:00:00Z",
        updatedAt: "2026-07-19T00:00:00Z",
      }),
    ).toThrow();
  });

  it("requires a full local day but permits a zero-duration timed task", () => {
    expect(() =>
      setTaskScheduleRequestSchema.parse({
        expectedVersion: 1,
        schedule: { kind: "all_day", startDate: "2026-07-19", endDate: "2026-07-19" },
      }),
    ).toThrow();
    expect(() =>
      setTaskScheduleRequestSchema.parse({
        expectedVersion: 1,
        schedule: {
          kind: "timed",
          startAt: "2026-07-19T09:00:00Z",
          endAt: "2026-07-19T09:00:00Z",
          timezone: "UTC",
        },
      }),
    ).not.toThrow();

    expect(() =>
      taskScheduleDtoSchema.parse({
        taskId,
        kind: "all_day",
        startDate: "2026-07-20",
        endDate: "2026-07-19",
        createdAt: "2026-07-19T00:00:00Z",
        updatedAt: "2026-07-19T00:00:00Z",
      }),
    ).toThrow();
    expect(() =>
      taskScheduleDtoSchema.parse({
        taskId,
        kind: "timed",
        startAt: "2026-07-19T10:00:00Z",
        endAt: "2026-07-19T09:00:00Z",
        timezone: "UTC",
        createdAt: "2026-07-19T00:00:00Z",
        updatedAt: "2026-07-19T00:00:00Z",
      }),
    ).toThrow();
  });

  it("requires both bounded date and instant ranges", () => {
    expect(
      taskScheduleRangeQuerySchema.parse({
        rangeStartDate: "2026-07-01",
        rangeEndDate: "2026-08-01",
        rangeStartAt: "2026-06-30T16:00:00Z",
        rangeEndAt: "2026-07-31T16:00:00Z",
      }),
    ).toMatchObject({ limit: 250 });
    expect(() =>
      taskScheduleRangeQuerySchema.parse({
        rangeStartDate: "2026-07-01",
        rangeEndDate: "2026-07-01",
        rangeStartAt: "2026-07-01T00:00:00Z",
        rangeEndAt: "2026-07-02T00:00:00Z",
      }),
    ).toThrow();
  });

  it("retains source text and exposes recognized offsets with editable values", () => {
    const sourceText = "Record demo tomorrow at 2pm";
    expect(
      quickAddParseResultSchema.parse({
        sourceText,
        suggestions: [
          {
            recognizedText: "tomorrow at 2pm",
            startIndex: 12,
            endIndex: 27,
            schedule: {
              kind: "timed",
              startAt: "2026-07-20T06:00:00Z",
              endAt: "2026-07-20T06:00:00Z",
              timezone: "Asia/Singapore",
            },
            warnings: [],
          },
        ],
      }).sourceText,
    ).toBe(sourceText);
  });
});
