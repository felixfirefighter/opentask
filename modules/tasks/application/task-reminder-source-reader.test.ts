import type { Database } from "@/shared/db/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repositories = vi.hoisted(() => ({
  tasks: { findById: vi.fn(), lockById: vi.fn() },
  schedules: { findByTaskId: vi.fn(), lockByTaskId: vi.fn() },
  recurrences: { findByTaskId: vi.fn(), lockByTaskId: vi.fn() },
  events: { findLatest: vi.fn() },
}));

vi.mock("../infrastructure/task-repository", () => ({
  createTaskRepository: () => repositories.tasks,
}));
vi.mock("../infrastructure/task-schedule-repository", () => ({
  createTaskScheduleRepository: () => repositories.schedules,
}));
vi.mock("../infrastructure/task-recurrence-repository", () => ({
  createTaskRecurrenceRepository: () => repositories.recurrences,
}));
vi.mock("../infrastructure/task-occurrence-event-repository", () => ({
  createTaskOccurrenceEventRepository: () => repositories.events,
}));

import { createTaskReminderSourceReader } from "./task-reminder-source-reader";
import { RruleRecurrenceExpander } from "../infrastructure/recurrence/rrule-expander";
import type { TaskScheduleTable } from "../infrastructure/schema";

const userId = "10000000-0000-4000-8000-000000000001";
const taskId = "20000000-0000-4000-8000-000000000001";
const actor = { userId };
const cursor = new Date("2026-07-20T00:00:00.000Z");
const executor = { kind: "transaction" } as unknown as Database;
const database = {} as Database;

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: taskId,
    status: "open",
    deletedAt: null,
    ...overrides,
  };
}

function timedSchedule() {
  return {
    userId,
    taskId,
    kind: "timed",
    startDate: null,
    endDate: null,
    startAt: new Date("2026-07-20T04:00:00.000Z"),
    endAt: new Date("2026-07-20T05:00:00.000Z"),
    timezone: "Asia/Singapore",
    createdAt: cursor,
    updatedAt: cursor,
  };
}

function allDaySchedule() {
  return {
    ...timedSchedule(),
    kind: "all_day",
    startDate: "2026-07-20",
    endDate: "2026-07-21",
    startAt: null,
    endAt: null,
    timezone: null,
  };
}

function recurrence() {
  return {
    userId,
    taskId,
    rrule: "FREQ=DAILY;INTERVAL=1",
    timezone: "Asia/Singapore",
    generationMode: "schedule",
    projectionStartDate: "2026-07-20",
    projectionStartAt: null,
    projectionEndDate: null,
    projectionEndAt: null,
    createdAt: cursor,
    updatedAt: cursor,
  };
}

function reader() {
  return createTaskReminderSourceReader({
    database,
    taskSchedules: {} as TaskScheduleTable,
    expansion: new RruleRecurrenceExpander(),
  });
}

describe("task reminder source reader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositories.tasks.findById.mockResolvedValue(task());
    repositories.tasks.lockById.mockResolvedValue(task());
    repositories.recurrences.findByTaskId.mockResolvedValue(null);
    repositories.recurrences.lockByTaskId.mockResolvedValue(null);
    repositories.schedules.findByTaskId.mockResolvedValue(timedSchedule());
    repositories.schedules.lockByTaskId.mockResolvedValue(timedSchedule());
    repositories.events.findLatest.mockResolvedValue(null);
  });

  it("returns a strictly future timed one-off through actor-scoped aggregate locks", async () => {
    await expect(
      reader().readOwned(actor, { taskId, relativeStartAfter: cursor, lock: true }, executor),
    ).resolves.toEqual({
      taskId,
      status: "open",
      deleted: false,
      recurring: false,
      relativeStart: { startAt: new Date("2026-07-20T04:00:00.000Z"), occurrenceKey: null },
    });

    expect(repositories.tasks.lockById).toHaveBeenCalledWith(userId, taskId, "any", executor);
    expect(repositories.tasks.lockById.mock.invocationCallOrder[0]).toBeLessThan(
      repositories.recurrences.lockByTaskId.mock.invocationCallOrder[0]!,
    );
    expect(repositories.recurrences.lockByTaskId.mock.invocationCallOrder[0]).toBeLessThan(
      repositories.schedules.lockByTaskId.mock.invocationCallOrder[0]!,
    );
  });

  it("keeps dormant recurrence identity while withholding terminal relative starts", async () => {
    repositories.tasks.findById.mockResolvedValue(task({ status: "cancelled", deletedAt: cursor }));
    repositories.recurrences.findByTaskId.mockResolvedValue(recurrence());
    repositories.schedules.findByTaskId.mockResolvedValue(allDaySchedule());

    await expect(
      reader().readOwned(actor, { taskId, relativeStartAfter: cursor, lock: false }),
    ).resolves.toMatchObject({
      taskId,
      status: "cancelled",
      deleted: true,
      recurring: true,
      relativeStart: null,
    });
  });

  it("skips terminal recurring occurrences and returns the next open midnight in the stored zone", async () => {
    repositories.recurrences.lockByTaskId.mockResolvedValue(recurrence());
    repositories.schedules.lockByTaskId.mockResolvedValue(allDaySchedule());
    repositories.events.findLatest.mockResolvedValueOnce({ state: "completed" }).mockResolvedValueOnce(null);

    const source = await reader().readOwned(
      actor,
      { taskId, relativeStartAfter: cursor, lock: true },
      executor,
    );

    expect(source?.relativeStart?.startAt.toISOString()).toBe("2026-07-21T16:00:00.000Z");
    expect(source?.relativeStart?.occurrenceKey).toMatch(/^o1\./);
    expect(repositories.events.findLatest).toHaveBeenCalledTimes(2);
  });

  it("returns no existence signal for an actor-owned miss", async () => {
    repositories.tasks.findById.mockResolvedValue(null);
    await expect(
      reader().readOwned(actor, { taskId, relativeStartAfter: cursor, lock: false }),
    ).resolves.toBeNull();
    expect(repositories.recurrences.findByTaskId).not.toHaveBeenCalled();
  });
});
