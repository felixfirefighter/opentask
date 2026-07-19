import { describe, expect, it } from "vitest";

import type { TaskScheduleDto } from "../application/contracts";
import {
  createTaskScheduleDraft,
  formatTaskSchedule,
  interpretTaskScheduleDraft,
  taskScheduleValueFromDraft,
  type TaskScheduleDraft,
} from "./task-schedule-form-policy";

describe("task schedule form policy", () => {
  it("keeps all-day values as local inclusive/exclusive dates", () => {
    const draft: TaskScheduleDraft = {
      ...baseDraft(),
      kind: "all_day",
      startDate: "2026-07-20",
      endDate: "2026-07-21",
    };

    expect(taskScheduleValueFromDraft(draft)).toEqual({
      kind: "all_day",
      startDate: "2026-07-20",
      endDate: "2026-07-21",
    });
    expect(interpretTaskScheduleDraft(draft, "h23")).toMatchObject({
      valid: true,
      summary: "All day · Jul 20, 2026 · ends before Jul 21, 2026 in Asia/Singapore",
    });
  });

  it("converts visible local timed values through the selected IANA timezone", () => {
    expect(
      taskScheduleValueFromDraft({
        ...baseDraft(),
        kind: "timed",
        startLocal: "2026-07-20T09:00",
        endLocal: "2026-07-20T10:30",
      }),
    ).toEqual({
      kind: "timed",
      startAt: "2026-07-20T01:00:00Z",
      endAt: "2026-07-20T02:30:00Z",
      timezone: "Asia/Singapore",
    });
  });

  it("maps saved timed instants back to their intent timezone for editing", () => {
    const schedule: TaskScheduleDto = {
      taskId: "0da6e6d9-2cf0-47cc-b869-964b6e91c3c0",
      kind: "timed",
      startAt: "2026-07-20T01:00:00Z",
      endAt: "2026-07-20T02:30:00Z",
      timezone: "Asia/Singapore",
      createdAt: "2026-07-19T00:00:00Z",
      updatedAt: "2026-07-19T00:00:00Z",
    };

    expect(createTaskScheduleDraft(schedule, "UTC")).toMatchObject({
      kind: "timed",
      startLocal: "2026-07-20T09:00",
      endLocal: "2026-07-20T10:30",
      timeZone: "Asia/Singapore",
    });
  });

  it("rejects an all-day end date that is not exclusive and later", () => {
    const result = interpretTaskScheduleDraft(
      { ...baseDraft(), startDate: "2026-07-20", endDate: "2026-07-20" },
      "h12",
    );

    expect(result).toEqual({ valid: false, message: "End date must be after start date." });
  });

  it("rejects spring-forward gaps and fall-back folds rather than choosing silently", () => {
    const gap = interpretTaskScheduleDraft(
      {
        ...baseDraft(),
        kind: "timed",
        timeZone: "America/New_York",
        startLocal: "2026-03-08T02:30",
        endLocal: "2026-03-08T04:00",
      },
      "h12",
    );
    const fold = interpretTaskScheduleDraft(
      {
        ...baseDraft(),
        kind: "timed",
        timeZone: "America/New_York",
        startLocal: "2026-11-01T01:30",
        endLocal: "2026-11-01T03:00",
      },
      "h12",
    );

    expect(gap).toMatchObject({ valid: false });
    expect(fold).toMatchObject({ valid: false });
    expect(gap.valid ? "" : gap.message).toContain("Daylight-saving");
    expect(fold.valid ? "" : fold.message).toContain("repeated times");
  });

  it("formats timed instants in their saved zone and hour cycle", () => {
    const summary = formatTaskSchedule(
      {
        kind: "timed",
        startAt: "2026-07-20T01:00:00Z",
        endAt: "2026-07-20T02:30:00Z",
        timezone: "Asia/Singapore",
      },
      "UTC",
      "h23",
    );

    expect(summary).toContain("09:00");
    expect(summary).toContain("10:30");
    expect(summary).toContain("Asia/Singapore");
  });
});

function baseDraft(): TaskScheduleDraft {
  return {
    kind: "all_day",
    startDate: "2026-07-20",
    endDate: "2026-07-21",
    startLocal: "2026-07-20T09:00",
    endLocal: "2026-07-20T10:00",
    timeZone: "Asia/Singapore",
  };
}
