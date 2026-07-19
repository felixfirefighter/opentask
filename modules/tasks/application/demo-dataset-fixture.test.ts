import { describe, expect, it } from "vitest";

import { buildDemoDatasetFixture, DEMO_TIME_ZONE } from "./demo-dataset-fixture";

const inboxId = "70000000-0000-4000-8000-000000000001";

describe("demo dataset fixture", () => {
  it("builds the same complete story for the same reset instant", () => {
    const resetAt = new Date("2026-07-20T08:00:00.000Z");
    const first = buildDemoDatasetFixture(resetAt, inboxId);
    const second = buildDemoDatasetFixture(new Date(resetAt), inboxId);

    expect(second).toEqual(first);
    expect(first.tasks).toHaveLength(10);
    expect(first.schedules).toHaveLength(4);
    expect(first.tags).toHaveLength(3);
    expect(first.checklistItems).toHaveLength(3);
    expect(first.taskTags).toHaveLength(5);
    expect(first.tasks.filter((task) => task.status === "completed")).toHaveLength(1);
    expect(first.tasks.filter((task) => task.status === "cancelled")).toHaveLength(1);
    expect(first.tasks.filter((task) => task.parentTaskId !== null)).toHaveLength(1);
    expect(first.tasks.filter((task) => task.listId === inboxId)).toHaveLength(2);
  });

  it("keeps Today, Upcoming, calendar, matrix, and planner-ready records coherent", () => {
    const fixture = buildDemoDatasetFixture(new Date("2026-07-20T08:00:00.000Z"), inboxId);
    const schedules = new Map(fixture.schedules.map((schedule) => [schedule.taskId, schedule]));
    const byTitle = new Map(fixture.tasks.map((task) => [task.title, task]));

    expect(schedules.get(byTitle.get("Record the two-minute demo")!.id)).toMatchObject({
      kind: "timed",
      startAt: new Date("2026-07-20T10:30:00.000Z"),
      endAt: new Date("2026-07-20T11:30:00.000Z"),
      timezone: DEMO_TIME_ZONE,
    });
    expect(schedules.get(byTitle.get("Prepare clean demo data")!.id)).toEqual({
      taskId: byTitle.get("Prepare clean demo data")!.id,
      kind: "all_day",
      startDate: "2026-07-20",
      endDate: "2026-07-21",
    });
    expect(schedules.get(byTitle.get("Write the submission summary")!.id)).toMatchObject({
      startDate: "2026-07-21",
      endDate: "2026-07-22",
    });
    expect(byTitle.get("Draft the launch narrative")).toMatchObject({
      priority: "high",
      status: "open",
    });
    expect(schedules.has(byTitle.get("Draft the launch narrative")!.id)).toBe(false);
    expect(schedules.has(byTitle.get("Polish the friend test script")!.id)).toBe(false);
  });
});
