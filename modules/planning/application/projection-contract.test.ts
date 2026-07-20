import { describe, expect, it } from "vitest";

import {
  calendarEventDtoSchema,
  calendarProjectionSchema,
  eisenhowerProjectionSchema,
  planningRangeQuerySchema,
  planningTaskRowSchema,
  projectionLimitQuerySchema,
  projectionScheduleSchema,
  upcomingProjectionSchema,
} from "@/modules/planning";

const taskId = "20000000-0000-4000-8000-000000000001";
const listId = "20000000-0000-4000-8000-000000000002";

const task = {
  id: taskId,
  projectionId: `task:${taskId}`,
  projectionLifecycle: "one_off",
  occurrenceKey: null,
  occurrenceState: null,
  recurrenceSummary: null,
  scheduleInteraction: {
    editScope: "task",
    dragEnabled: true,
    dragDisabledReason: null,
  },
  listId,
  title: "Prepare the demo",
  status: "open",
  priority: "high",
  rank: "a0",
  version: 2,
  schedule: null,
} as const;

describe("planning projection query contracts", () => {
  it("applies a bounded default and rejects unknown keys", () => {
    expect(projectionLimitQuerySchema.parse({})).toEqual({ limit: 250 });
    expect(() => projectionLimitQuerySchema.parse({ limit: 501 })).toThrow();
    expect(() => projectionLimitQuerySchema.parse({ limit: 20, ownerId: taskId })).toThrow();
  });

  it("accepts finite local ranges up to 62 days", () => {
    expect(
      planningRangeQuerySchema.parse({
        rangeStartDate: "2026-07-01",
        rangeEndDate: "2026-09-01",
      }),
    ).toEqual({
      rangeStartDate: "2026-07-01",
      rangeEndDate: "2026-09-01",
      limit: 250,
    });

    expect(() =>
      planningRangeQuerySchema.parse({
        rangeStartDate: "2026-07-01",
        rangeEndDate: "2026-07-01",
      }),
    ).toThrow();
    expect(() =>
      planningRangeQuerySchema.parse({
        rangeStartDate: "2026-07-01",
        rangeEndDate: "2026-09-02",
      }),
    ).toThrow();
  });
});

describe("planning projection DTO contracts", () => {
  it("keeps schedule unions strict and permits canonical point tasks", () => {
    expect(
      projectionScheduleSchema.parse({
        kind: "timed",
        startAt: "2026-07-20T01:00:00Z",
        endAt: "2026-07-20T01:00:00Z",
        timezone: "Asia/Singapore",
      }),
    ).toMatchObject({ kind: "timed" });

    expect(() =>
      projectionScheduleSchema.parse({
        kind: "all_day",
        startDate: "2026-07-20",
        endDate: "2026-07-20",
      }),
    ).toThrow();
    expect(() => planningTaskRowSchema.parse({ ...task, dueAt: null })).toThrow();
    expect(() => planningTaskRowSchema.parse({ ...task, taskId })).toThrow();
  });

  it("requires exactly seven Upcoming day buckets", () => {
    expect(() =>
      upcomingProjectionSchema.parse({
        rangeStartDate: "2026-07-20",
        rangeEndDate: "2026-07-27",
        timeZone: "Asia/Singapore",
        nowAt: "2026-07-20T01:00:00Z",
        days: [],
        remainingCount: 0,
        truncated: false,
      }),
    ).toThrow();
  });

  it("requires composite recurrence identity and disabled series dragging metadata", () => {
    const occurrenceKey = "o1.stable_key";
    const recurring = {
      ...task,
      projectionId: `occurrence:${taskId}:${occurrenceKey}`,
      projectionLifecycle: "recurring_occurrence",
      occurrenceKey,
      occurrenceState: "open",
      scheduleInteraction: {
        editScope: "series",
        dragEnabled: false,
        dragDisabledReason: "Recurring occurrences must be edited through the series schedule.",
      },
      schedule: {
        kind: "all_day",
        startDate: "2026-07-20",
        endDate: "2026-07-21",
      },
    } as const;

    expect(planningTaskRowSchema.parse(recurring)).toMatchObject({ occurrenceKey });
    expect(() =>
      planningTaskRowSchema.parse({
        ...recurring,
        projectionId: `task:${taskId}`,
        scheduleInteraction: { ...recurring.scheduleInteraction, dragEnabled: true },
      }),
    ).toThrow(/metadata is inconsistent/i);
  });

  it("caps Calendar and Matrix results and prevents duplicate quadrant membership", () => {
    expect(
      calendarProjectionSchema.parse({
        rangeStartDate: "2026-07-20",
        rangeEndDate: "2026-07-21",
        rangeStartAt: "2026-07-19T16:00:00Z",
        rangeEndAt: "2026-07-20T16:00:00Z",
        timeZone: "Asia/Singapore",
        events: [],
        truncated: false,
      }),
    ).toMatchObject({ events: [] });

    expect(() =>
      eisenhowerProjectionSchema.parse({
        timeZone: "Asia/Singapore",
        nowAt: "2026-07-20T01:00:00Z",
        urgentThroughAt: "2026-07-21T01:00:00Z",
        doNow: [task],
        plan: [task],
        timeSensitive: [],
        later: [],
        truncated: false,
      }),
    ).toThrow();
  });

  it("rejects invalid flattened Calendar event bounds", () => {
    expect(() =>
      calendarEventDtoSchema.parse({
        taskId,
        projectionId: `task:${taskId}`,
        projectionLifecycle: "one_off",
        occurrenceKey: null,
        occurrenceState: null,
        recurrenceSummary: null,
        scheduleInteraction: {
          editScope: "task",
          dragEnabled: true,
          dragDisabledReason: null,
        },
        listId,
        title: "Backwards event",
        status: "open",
        priority: "none",
        version: 1,
        kind: "timed",
        startAt: "2026-07-20T02:00:00Z",
        endAt: "2026-07-20T01:00:00Z",
        timezone: "Asia/Singapore",
      }),
    ).toThrow();
  });
});
