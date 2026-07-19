import { describe, expect, it } from "vitest";

import { buildLocalRange } from "./local-time-policy";
import type { ProjectionSchedule, ProjectionSourceTask } from "./projection-model";
import { projectToday } from "./today-policy";
import { projectUpcoming } from "./upcoming-policy";

const singaporeContext = {
  localDate: "2026-07-20",
  timeZone: "Asia/Singapore",
  nowAt: "2026-07-20T04:00:00Z",
} as const;

describe("Today projection policy", () => {
  it("returns explicit empty sections for an empty day", () => {
    expect(projectToday([], singaporeContext)).toEqual({ overdue: [], timed: [], anytime: [] });
  });

  it("separates overdue, chronological timed, and all-day tasks", () => {
    const rows = [
      task("timed-later", timed("2026-07-20T06:00:00Z", "2026-07-20T07:00:00Z")),
      task("all-day", allDay("2026-07-20", "2026-07-21")),
      task("overdue", timed("2026-07-20T02:00:00Z", "2026-07-20T03:00:00Z")),
      task("timed-sooner", timed("2026-07-20T05:00:00Z", "2026-07-20T05:30:00Z")),
    ];

    const projection = projectToday(rows, singaporeContext);

    expect(ids(projection.overdue)).toEqual(["overdue"]);
    expect(ids(projection.timed)).toEqual(["timed-sooner", "timed-later"]);
    expect(ids(projection.anytime)).toEqual(["all-day"]);
  });

  it("retains exclusive-end overdue work and rejects future non-overlapping rows", () => {
    const projection = projectToday(
      [
        task("ended-all-day", allDay("2026-07-19", "2026-07-20")),
        task("future-all-day", allDay("2026-07-21", "2026-07-30")),
        task("future-timed", timed("2026-07-21T01:00:00Z", "2026-07-25T01:00:00Z")),
      ],
      singaporeContext,
    );

    expect(ids(projection.overdue)).toEqual(["ended-all-day"]);
    expect(projection.timed).toEqual([]);
    expect(projection.anytime).toEqual([]);
  });

  it("filters terminal and deleted records defensively", () => {
    const schedule = allDay("2026-07-20", "2026-07-21");
    const projection = projectToday(
      [
        task("open", schedule),
        task("completed", schedule, { status: "completed" }),
        task("cancelled", schedule, { status: "cancelled" }),
        task("deleted", schedule, { deletedAt: "2026-07-20T00:00:00Z" }),
      ],
      singaporeContext,
    );

    expect(ids(projection.anytime)).toEqual(["open"]);
  });

  it("uses a 23-hour local day across spring-forward", () => {
    const context = {
      localDate: "2026-03-08",
      timeZone: "America/New_York",
      nowAt: "2026-03-08T05:30:00Z",
    } as const;
    const projection = projectToday(
      [
        task("late-local", timed("2026-03-09T03:00:00Z", "2026-03-09T03:30:00Z")),
        task("next-midnight", timed("2026-03-09T04:00:00Z", "2026-03-09T04:00:00Z")),
      ],
      context,
    );

    expect(ids(projection.timed)).toEqual(["late-local"]);
  });

  it("rejects a local date that does not match now", () => {
    expect(() => projectToday([], { ...singaporeContext, localDate: "2026-07-21" })).toThrow(
      "must match now",
    );
  });
});

describe("Upcoming projection policy", () => {
  it("returns seven stable day buckets and excludes work already due", () => {
    const range = buildLocalRange("2026-07-20", "2026-07-27", "Asia/Singapore");
    const days = projectUpcoming(
      [
        task("today-all-day", allDay("2026-07-20", "2026-07-21")),
        task("spanning", timed("2026-07-19T20:00:00Z", "2026-07-20T06:00:00Z")),
        task("tomorrow", timed("2026-07-21T01:00:00Z", "2026-07-21T02:00:00Z")),
        task("already-due", timed("2026-07-20T03:00:00Z", singaporeContext.nowAt)),
        task("upper-point", timed(range.endAt, range.endAt)),
      ],
      { range, timeZone: singaporeContext.timeZone, nowAt: singaporeContext.nowAt },
    );

    expect(days).toHaveLength(7);
    expect(days.map((day) => day.localDate)).toEqual([
      "2026-07-20",
      "2026-07-21",
      "2026-07-22",
      "2026-07-23",
      "2026-07-24",
      "2026-07-25",
      "2026-07-26",
    ]);
    expect(ids(days[0]?.tasks ?? [])).toEqual(["today-all-day", "spanning"]);
    expect(ids(days[1]?.tasks ?? [])).toEqual(["tomorrow"]);
    expect(days.flatMap((day) => ids(day.tasks))).not.toContain("already-due");
    expect(days.flatMap((day) => ids(day.tasks))).not.toContain("upper-point");
  });

  it("rejects ranges that are not exactly seven local days", () => {
    const range = buildLocalRange("2026-07-20", "2026-07-26", "Asia/Singapore");
    expect(() =>
      projectUpcoming([], { range, timeZone: singaporeContext.timeZone, nowAt: singaporeContext.nowAt }),
    ).toThrow("exactly seven");
  });

  it("keeps all seven buckets when the range is empty", () => {
    const range = buildLocalRange("2026-07-20", "2026-07-27", "Asia/Singapore");
    const days = projectUpcoming([], {
      range,
      timeZone: singaporeContext.timeZone,
      nowAt: singaporeContext.nowAt,
    });
    expect(days).toHaveLength(7);
    expect(days.every((day) => day.tasks.length === 0)).toBe(true);
  });
});

function task(
  id: string,
  schedule: ProjectionSchedule | null,
  overrides: Partial<ProjectionSourceTask> = {},
): ProjectionSourceTask {
  return {
    id,
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

function timed(startAt: string, endAt: string): ProjectionSchedule {
  return { kind: "timed", startAt, endAt, timezone: "Asia/Singapore" };
}

function allDay(startDate: string, endDate: string): ProjectionSchedule {
  return { kind: "all_day", startDate, endDate };
}

function ids(rows: readonly Readonly<{ id: string }>[]): string[] {
  return rows.map((row) => row.id);
}
