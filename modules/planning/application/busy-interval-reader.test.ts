import { describe, expect, it, vi } from "vitest";

import type { TaskDto, TaskScheduleDto, TaskScheduleValue, TasksApplication } from "@/modules/tasks";

import { createPlanningBusyIntervalReader, type PlanningBusyIntervalQuery } from "./busy-interval-reader";
import type {
  PlanningOccurrenceSourcePage,
  PlanningOccurrenceSourceReader,
  PlanningOccurrenceTruncationReason,
} from "./planning-source-reader";

const occurrencePortConforms: TasksApplication["occurrences"] extends PlanningOccurrenceSourceReader
  ? true
  : false = true;
const actor = { userId: "10000000-0000-4000-8000-000000000001" } as const;
const query: PlanningBusyIntervalQuery = {
  timeZone: "Asia/Singapore",
  rangeStartDate: "2026-07-20",
  rangeEndDate: "2026-07-21",
  rangeStartAt: "2026-07-20T01:00:00Z",
  rangeEndAt: "2026-07-20T09:00:00Z",
  limit: 500,
};

describe("planning busy interval reader", () => {
  it("accepts the bounded task occurrence service as its source port", () => {
    expect(occurrencePortConforms).toBe(true);
  });

  it("returns only active open timed one-offs and recurring occurrences", async () => {
    const source = sourceReader(
      occurrencePage([
        oneOff("00000000-0000-4000-8000-000000000001", allDaySchedule()),
        oneOff(
          "00000000-0000-4000-8000-000000000002",
          timedScheduleDto(
            "00000000-0000-4000-8000-000000000002",
            "2026-07-20T01:00:00Z",
            "2026-07-20T02:00:00Z",
          ),
        ),
        recurring(
          "00000000-0000-4000-8000-000000000003",
          "open",
          timedSchedule("2026-07-20T02:00:00Z", "2026-07-20T03:00:00Z"),
        ),
        recurring(
          "00000000-0000-4000-8000-000000000004",
          "completed",
          timedSchedule("2026-07-20T03:00:00Z", "2026-07-20T04:00:00Z"),
        ),
        recurring(
          "00000000-0000-4000-8000-000000000005",
          "skipped",
          timedSchedule("2026-07-20T04:00:00Z", "2026-07-20T05:00:00Z"),
        ),
        recurring("00000000-0000-4000-8000-000000000006", "open", {
          kind: "all_day",
          startDate: "2026-07-20",
          endDate: "2026-07-21",
        }),
        recurring(
          "00000000-0000-4000-8000-000000000007",
          "open",
          timedSchedule("2026-07-20T05:00:00Z", "2026-07-20T06:00:00Z"),
          { status: "completed" },
        ),
      ]),
    );

    await expect(createPlanningBusyIntervalReader(source).readBusyIntervals(actor, query)).resolves.toEqual({
      items: [
        { startAt: "2026-07-20T01:00:00Z", endAt: "2026-07-20T02:00:00Z" },
        { startAt: "2026-07-20T02:00:00Z", endAt: "2026-07-20T03:00:00Z" },
      ],
      truncation: emptyTruncation(),
    });
    expect(source.readBoundedOccurrences).toHaveBeenCalledWith(
      actor,
      {
        rangeStartDate: "2026-07-20",
        rangeEndDate: "2026-07-21",
        rangeStartAt: "2026-07-20T01:00:00Z",
        rangeEndAt: "2026-07-20T09:00:00Z",
        limit: 500,
      },
      "Asia/Singapore",
    );
  });

  it.each([
    "source_limit",
    "event_source_limit",
    "series_candidate_limit",
    "request_candidate_limit",
    "output_limit",
  ] as const)("preserves the %s truncation signal for the fail-closed caller", async (reason) => {
    const source = sourceReader(occurrencePage([], reason));

    await expect(createPlanningBusyIntervalReader(source).readBusyIntervals(actor, query)).resolves.toEqual({
      items: [],
      truncation: expect.objectContaining({ truncated: true, reasons: [reason] }),
    });
  });

  it("does not reserve a read-only historical occurrence while retaining an eligible occurrence", async () => {
    const source = sourceReader(
      occurrencePage([
        recurring(
          "00000000-0000-4000-8000-000000000008",
          "open",
          timedSchedule("2026-07-20T06:00:00Z", "2026-07-20T07:00:00Z"),
          {},
          false,
        ),
        recurring(
          "00000000-0000-4000-8000-000000000009",
          "open",
          timedSchedule("2026-07-20T07:00:00Z", "2026-07-20T08:00:00Z"),
        ),
      ]),
    );

    await expect(createPlanningBusyIntervalReader(source).readBusyIntervals(actor, query)).resolves.toEqual({
      items: [{ startAt: "2026-07-20T07:00:00Z", endAt: "2026-07-20T08:00:00Z" }],
      truncation: emptyTruncation(),
    });
  });
});

function sourceReader(page: PlanningOccurrenceSourcePage): PlanningOccurrenceSourceReader {
  return { readBoundedOccurrences: vi.fn(async () => page) };
}

function occurrencePage(
  items: PlanningOccurrenceSourcePage["items"],
  reason?: PlanningOccurrenceTruncationReason,
): PlanningOccurrenceSourcePage {
  return {
    items,
    truncation: {
      ...emptyTruncation(),
      truncated: reason !== undefined,
      reasons: reason === undefined ? [] : [reason],
    },
  };
}

function emptyTruncation(): PlanningOccurrenceSourcePage["truncation"] {
  return {
    truncated: false,
    reasons: [],
    recurrenceRowsEvaluated: 0,
    occurrenceEventsEvaluated: 0,
    candidateEvaluations: 0,
  };
}

function oneOff(taskId: string, schedule: TaskScheduleDto) {
  return { projectionKind: "one_off" as const, task: task(taskId), schedule };
}

function recurring(
  taskId: string,
  occurrenceState: "open" | "completed" | "skipped",
  schedule: TaskScheduleValue,
  taskPatch: Partial<TaskDto> = {},
  transitionEligible = true,
) {
  const recurringTask = task(taskId, taskPatch);
  return {
    projectionKind: "recurring" as const,
    task: recurringTask,
    occurrence: {
      taskId,
      taskVersion: recurringTask.version,
      occurrenceKey: `o1.${taskId.slice(-1)}`,
      occurrenceState,
      transitionEligible,
      schedule,
    },
  };
}

function task(id: string, patch: Partial<TaskDto> = {}): TaskDto {
  return {
    id,
    listId: "20000000-0000-4000-8000-000000000001",
    sectionId: null,
    parentTaskId: null,
    title: "Planner context task",
    descriptionMd: "Must not cross the busy-context boundary.",
    status: "open",
    priority: "none",
    rank: `a${id.slice(-1)}`,
    statusChangedAt: "2026-07-19T00:00:00Z",
    version: 1,
    createdAt: "2026-07-19T00:00:00Z",
    updatedAt: "2026-07-19T00:00:00Z",
    deletedAt: null,
    ...patch,
  };
}

function allDaySchedule(taskId = "00000000-0000-4000-8000-000000000001"): TaskScheduleDto {
  return {
    taskId,
    kind: "all_day",
    startDate: "2026-07-20",
    endDate: "2026-07-21",
    createdAt: "2026-07-19T00:00:00Z",
    updatedAt: "2026-07-19T00:00:00Z",
  };
}

function timedSchedule(startAt: string, endAt: string): TaskScheduleValue {
  return { kind: "timed", startAt, endAt, timezone: "Asia/Singapore" };
}

function timedScheduleDto(taskId: string, startAt: string, endAt: string): TaskScheduleDto {
  return {
    taskId,
    ...timedSchedule(startAt, endAt),
    createdAt: "2026-07-19T00:00:00Z",
    updatedAt: "2026-07-19T00:00:00Z",
  };
}
