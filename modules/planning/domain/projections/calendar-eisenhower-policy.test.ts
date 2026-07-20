import { describe, expect, it } from "vitest";

import { projectAgendaTasks, projectCalendarTasks } from "./calendar-policy";
import { projectEisenhower } from "./eisenhower-policy";
import { buildLocalRange, formatInstant } from "./local-time-policy";
import type { OneOffProjectionTask, ProjectionSchedule, ProjectionSourceTask } from "./projection-model";

describe("Calendar and Agenda projection policies", () => {
  const range = buildLocalRange("2026-07-20", "2026-07-21", "Asia/Singapore");

  it("uses half-open all-day and timed boundaries, including point tasks", () => {
    const events = projectCalendarTasks(
      [
        task("all-day-overlap", allDay("2026-07-19", "2026-07-21")),
        task("all-day-ended", allDay("2026-07-19", "2026-07-20")),
        task("all-day-upper", allDay("2026-07-21", "2026-07-22")),
        task("timed-overlap", timed("2026-07-19T15:30:00Z", "2026-07-19T17:00:00Z")),
        task("timed-ended", timed("2026-07-19T15:00:00Z", range.startAt)),
        task("point-lower", timed(range.startAt, range.startAt)),
        task("point-upper", timed(range.endAt, range.endAt)),
      ],
      range,
    );

    expect(ids(events)).toEqual(["all-day-overlap", "timed-overlap", "point-lower"]);
  });

  it("returns an empty projection without inventing events", () => {
    expect(projectCalendarTasks([], range)).toEqual([]);
  });

  it("keeps terminal recurring occurrences visible for state and Undo", () => {
    const completed = recurringOccurrence(
      "completed-occurrence",
      "o1.completed",
      allDay("2026-07-20", "2026-07-21"),
      "completed",
    );
    const skipped = recurringOccurrence(
      "skipped-occurrence",
      "o1.skipped",
      timed("2026-07-19T17:00:00Z", "2026-07-19T18:00:00Z"),
      "skipped",
    );

    expect(
      projectCalendarTasks([completed, skipped], range).map((row) =>
        row.projectionLifecycle === "recurring_occurrence" ? row.occurrenceState : null,
      ),
    ).toEqual(["completed", "skipped"]);
  });

  it("groups spanning Agenda events at the visible range start", () => {
    const agenda = projectAgendaTasks(
      [
        task("spanning-all-day", allDay("2026-07-18", "2026-07-21")),
        task("spanning-timed", timed("2026-07-19T14:00:00Z", "2026-07-20T01:00:00Z")),
      ],
      range,
      "Asia/Singapore",
    );

    expect(agenda.map((row) => [row.groupDate, row.task.taskId])).toEqual([
      ["2026-07-20", "spanning-all-day"],
      ["2026-07-20", "spanning-timed"],
    ]);
  });

  it("computes a 23-hour range over New York spring-forward", () => {
    const dstRange = buildLocalRange("2026-03-08", "2026-03-09", "America/New_York");
    expect(dstRange).toEqual({
      startDate: "2026-03-08",
      endDate: "2026-03-09",
      startAt: "2026-03-08T05:00:00Z",
      endAt: "2026-03-09T04:00:00Z",
    });
  });

  it("computes a 25-hour range over New York fall-back", () => {
    expect(buildLocalRange("2026-11-01", "2026-11-02", "America/New_York")).toEqual({
      startDate: "2026-11-01",
      endDate: "2026-11-02",
      startAt: "2026-11-01T04:00:00Z",
      endAt: "2026-11-02T05:00:00Z",
    });
  });

  it("keeps month-end date arithmetic local", () => {
    expect(buildLocalRange("2026-07-31", "2026-08-01", "Asia/Singapore")).toEqual({
      startDate: "2026-07-31",
      endDate: "2026-08-01",
      startAt: "2026-07-30T16:00:00Z",
      endAt: "2026-07-31T16:00:00Z",
    });
  });
});

describe("Eisenhower projection policy", () => {
  it("classifies all four combinations and includes the exact 24-hour boundary", () => {
    const nowAt = "2026-07-20T00:00:00Z";
    const projection = projectEisenhower(
      [
        task("important-exact", timed(nowAt, "2026-07-21T00:00:00Z"), { priority: "high" }),
        task("important-unscheduled", null, { priority: "high" }),
        task("ordinary-overdue", timed("2026-07-19T00:00:00Z", "2026-07-19T01:00:00Z")),
        task("ordinary-later", timed(nowAt, "2026-07-21T00:00:00.000000001Z")),
        task("ordinary-unscheduled", null),
      ],
      { timeZone: "Asia/Singapore", nowAt },
    );

    expect(ids(projection.doNow)).toEqual(["important-exact"]);
    expect(ids(projection.plan)).toEqual(["important-unscheduled"]);
    expect(ids(projection.timeSensitive)).toEqual(["ordinary-overdue"]);
    expect(ids(projection.later)).toEqual(["ordinary-later", "ordinary-unscheduled"]);
    expect(formatInstant(projection.urgentThrough)).toBe("2026-07-21T00:00:00Z");
  });

  it("uses the saved timezone for an all-day exclusive end", () => {
    const projection = projectEisenhower([task("local-all-day", allDay("2026-07-21", "2026-07-22"))], {
      timeZone: "Asia/Singapore",
      nowAt: "2026-07-20T17:00:00Z",
    });

    expect(ids(projection.timeSensitive)).toEqual(["local-all-day"]);
    expect(projection.later).toEqual([]);
  });

  it("excludes completed, cancelled, and deleted tasks", () => {
    const schedule = timed("2026-07-20T00:00:00Z", "2026-07-20T01:00:00Z");
    const projection = projectEisenhower(
      [
        task("completed", schedule, { status: "completed" }),
        task("cancelled", schedule, { status: "cancelled" }),
        task("deleted", schedule, { deletedAt: "2026-07-20T00:00:00Z" }),
      ],
      { timeZone: "UTC", nowAt: "2026-07-20T00:00:00Z" },
    );

    expect([
      ...projection.doNow,
      ...projection.plan,
      ...projection.timeSensitive,
      ...projection.later,
    ]).toEqual([]);
  });
});

function task(
  id: string,
  schedule: ProjectionSchedule | null,
  overrides: Partial<Pick<OneOffProjectionTask, "status" | "priority" | "deletedAt" | "rank">> = {},
): OneOffProjectionTask {
  return {
    projectionId: `task:${id}`,
    taskId: id,
    projectionLifecycle: "one_off",
    listId: "list",
    title: id,
    status: "open",
    priority: "none",
    rank: `rank-${id}`,
    version: 1,
    deletedAt: null,
    schedule,
    ...overrides,
  };
}

function recurringOccurrence(
  taskId: string,
  occurrenceKey: string,
  schedule: ProjectionSchedule,
  occurrenceState: "open" | "completed" | "skipped",
): ProjectionSourceTask {
  return {
    ...task(taskId, schedule),
    projectionId: `occurrence:${taskId}:${occurrenceKey}`,
    projectionLifecycle: "recurring_occurrence",
    occurrenceKey,
    occurrenceState,
  };
}

function timed(startAt: string, endAt: string): ProjectionSchedule {
  return { kind: "timed", startAt, endAt, timezone: "Asia/Singapore" };
}

function allDay(startDate: string, endDate: string): ProjectionSchedule {
  return { kind: "all_day", startDate, endDate };
}

function ids(rows: readonly Readonly<{ taskId: string }>[]): string[] {
  return rows.map((row) => row.taskId);
}
