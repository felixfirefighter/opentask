import { describe, expect, it } from "vitest";

import { buildDemoDatasetFixture, DEMO_TIME_ZONE } from "./demo-dataset-fixture";
import { decodeOccurrenceKey } from "../domain/recurrence/occurrence-key";

const inboxId = "70000000-0000-4000-8000-000000000001";

describe("demo dataset fixture", () => {
  it("builds the same complete story for the same reset instant", () => {
    const resetAt = new Date("2026-07-20T08:00:00.000Z");
    const first = buildDemoDatasetFixture(resetAt, inboxId);
    const second = buildDemoDatasetFixture(new Date(resetAt), inboxId);

    expect(second).toEqual(first);
    expect(first.tasks).toHaveLength(11);
    expect(first.schedules).toHaveLength(5);
    expect(first.recurrences).toHaveLength(1);
    expect(first.occurrenceEvents).toHaveLength(2);
    expect(first.tags).toHaveLength(3);
    expect(first.checklistItems).toHaveLength(3);
    expect(first.taskTags).toHaveLength(6);
    expect(first.tasks.filter((task) => task.status === "completed")).toHaveLength(1);
    expect(first.tasks.filter((task) => task.status === "cancelled")).toHaveLength(1);
    expect(first.tasks.filter((task) => task.parentTaskId !== null)).toHaveLength(1);
    expect(first.tasks.filter((task) => task.listId === inboxId)).toHaveLength(2);
  });

  it("includes one canonical daily series with deterministic completed and skipped history", () => {
    const fixture = buildDemoDatasetFixture(new Date("2026-07-20T08:00:00.000Z"), inboxId);
    const recurringTask = fixture.tasks.find((task) => task.title === "Review workshop progress")!;
    const schedule = fixture.schedules.find(({ taskId }) => taskId === recurringTask.id);
    const recurrence = fixture.recurrences.find(({ taskId }) => taskId === recurringTask.id);

    expect(recurringTask).toMatchObject({
      parentTaskId: null,
      status: "open",
      version: 3,
    });
    expect(schedule).toEqual({
      taskId: recurringTask.id,
      kind: "timed",
      startAt: new Date("2026-07-18T09:00:00.000Z"),
      endAt: new Date("2026-07-18T09:15:00.000Z"),
      timezone: DEMO_TIME_ZONE,
    });
    expect(recurrence).toMatchObject({
      rrule: "FREQ=DAILY;INTERVAL=1",
      timezone: DEMO_TIME_ZONE,
      generationMode: "schedule",
      projectionStartAt: new Date("2026-07-18T09:00:00.000Z"),
      projectionEndAt: null,
    });
    expect(
      fixture.occurrenceEvents.map(({ occurrenceKey, state, taskVersion }) => ({
        startAt: decodedTimedStart(occurrenceKey, recurringTask.id),
        state,
        taskVersion,
      })),
    ).toEqual([
      { startAt: "2026-07-18T09:00:00Z", state: "completed", taskVersion: 2 },
      { startAt: "2026-07-19T09:00:00Z", state: "skipped", taskVersion: 3 },
    ]);
  });

  it("keeps Today, Upcoming, calendar, matrix, and planner-ready records coherent", () => {
    const fixture = buildDemoDatasetFixture(new Date("2026-07-20T08:00:00.000Z"), inboxId);
    const schedules = new Map(fixture.schedules.map((schedule) => [schedule.taskId, schedule]));
    const byTitle = new Map(fixture.tasks.map((task) => [task.title, task]));

    expect(schedules.get(byTitle.get("Outline the workshop agenda")!.id)).toMatchObject({
      kind: "timed",
      startAt: new Date("2026-07-20T10:30:00.000Z"),
      endAt: new Date("2026-07-20T11:30:00.000Z"),
      timezone: DEMO_TIME_ZONE,
    });
    expect(schedules.get(byTitle.get("Prepare attendee notes")!.id)).toEqual({
      taskId: byTitle.get("Prepare attendee notes")!.id,
      kind: "all_day",
      startDate: "2026-07-20",
      endDate: "2026-07-21",
    });
    expect(schedules.get(byTitle.get("Write the follow-up summary")!.id)).toMatchObject({
      startDate: "2026-07-21",
      endDate: "2026-07-22",
    });
    expect(byTitle.get("Draft the welcome message")).toMatchObject({
      priority: "high",
      status: "open",
    });
    expect(schedules.has(byTitle.get("Draft the welcome message")!.id)).toBe(false);
    expect(schedules.has(byTitle.get("Send the agenda to volunteers")!.id)).toBe(false);
  });
});

function decodedTimedStart(occurrenceKey: string, taskId: string): string {
  const decoded = decodeOccurrenceKey(occurrenceKey, taskId);
  if (decoded.kind !== "timed") throw new Error("Expected a timed demo occurrence key.");
  return decoded.startAt;
}
