import { describe, expect, it } from "vitest";

import { selectMatrixRecurrenceRows } from "./matrix-recurrence-policy";
import type { ProjectionSchedule, ProjectionSourceTask } from "./projection-model";

const input = { todayStartAt: "2026-07-19T16:00:00Z", timeZone: "Asia/Singapore" } as const;

describe("Matrix recurrence selection", () => {
  it("deduplicates overlapping reads and chooses the earliest eligible open occurrence", () => {
    const root = summary("series-a");
    const endedAtStart = occurrence(
      "series-a",
      "o1.ended",
      timed("2026-07-19T14:00:00Z", input.todayStartAt),
    );
    const spanning = occurrence(
      "series-a",
      "o1.spanning",
      timed("2026-07-19T15:00:00Z", "2026-07-19T17:00:00Z"),
    );
    const future = occurrence("series-a", "o1.future", timed("2026-07-20T08:00:00Z", "2026-07-20T09:00:00Z"));

    const selected = selectMatrixRecurrenceRows([root], [endedAtStart, spanning], [spanning, future], input);

    expect(selected).toEqual([spanning]);
  });

  it("ignores terminal occurrences and retains one nonurgent series summary", () => {
    const root = summary("series-a");
    const completed = occurrence(
      "series-a",
      "o1.completed",
      timed("2026-07-20T08:00:00Z", "2026-07-20T09:00:00Z"),
      "completed",
    );

    expect(selectMatrixRecurrenceRows([root], [], [completed], input)).toEqual([root]);
  });

  it("does not let read-only historical rows suppress the current eligible occurrence", () => {
    const root = summary("series-a");
    const historical = occurrence(
      "series-a",
      "o1.historical",
      timed("2026-07-19T15:00:00Z", "2026-07-19T17:00:00Z"),
      "open",
      false,
    );
    const current = occurrence(
      "series-a",
      "o1.current",
      timed("2026-07-20T08:00:00Z", "2026-07-20T09:00:00Z"),
    );

    expect(selectMatrixRecurrenceRows([root], [historical], [historical, current], input)).toEqual([current]);
  });

  it("does not add occurrence rows whose series root was truncated from all-open", () => {
    expect(
      selectMatrixRecurrenceRows(
        [oneOff("one-off")],
        [],
        [occurrence("missing-root", "o1.future", timed("2026-07-20T08:00:00Z", "2026-07-20T09:00:00Z"))],
        input,
      ),
    ).toEqual([oneOff("one-off")]);
  });
});

function oneOff(taskId: string): ProjectionSourceTask {
  return {
    projectionId: `task:${taskId}`,
    taskId,
    projectionLifecycle: "one_off",
    listId: "list",
    title: taskId,
    status: "open",
    priority: "none",
    rank: taskId,
    version: 1,
    deletedAt: null,
    schedule: null,
  };
}

function summary(taskId: string): ProjectionSourceTask {
  return {
    ...oneOff(taskId),
    projectionId: `series:${taskId}`,
    projectionLifecycle: "recurrence_summary",
    recurrenceSummary: "No occurrence in the next 62 days",
  };
}

function occurrence(
  taskId: string,
  occurrenceKey: string,
  schedule: ProjectionSchedule,
  occurrenceState: "open" | "completed" | "skipped" = "open",
  transitionEligible = true,
): ProjectionSourceTask {
  return {
    ...oneOff(taskId),
    projectionId: `occurrence:${taskId}:${occurrenceKey}`,
    projectionLifecycle: "recurring_occurrence",
    occurrenceKey,
    occurrenceState,
    transitionEligible,
    schedule,
  };
}

function timed(startAt: string, endAt: string): ProjectionSchedule {
  return { kind: "timed", startAt, endAt, timezone: "Asia/Singapore" };
}
