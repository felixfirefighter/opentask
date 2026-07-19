import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repositories = vi.hoisted(() => ({
  tasks: { findById: vi.fn(), lockById: vi.fn() },
  schedules: {
    findByTaskId: vi.fn(),
    upsert: vi.fn(),
    clear: vi.fn(),
    incrementTaskVersion: vi.fn(),
    listActiveOpenInRange: vi.fn(),
    loadOpenUnscheduled: vi.fn(),
  },
}));

vi.mock("../infrastructure/task-repository", () => ({
  createTaskRepository: () => repositories.tasks,
}));
vi.mock("../infrastructure/task-schedule-repository", () => ({
  createTaskScheduleRepository: () => repositories.schedules,
}));

import { createTaskScheduleApplication } from "./schedule-application";
import { createTaskSnapshotReader } from "./task-snapshot-reader";
import type { TaskScheduleTable } from "../infrastructure/schema";

const userId = "10000000-0000-4000-8000-000000000001";
const taskId = "20000000-0000-4000-8000-000000000001";
const otherTaskId = "20000000-0000-4000-8000-000000000002";
const listId = "30000000-0000-4000-8000-000000000001";
const now = new Date("2026-07-19T01:02:03.000Z");
const actor = { userId };
const transaction = { execute: vi.fn() };
const database = {
  transaction: vi.fn(async (work: (executor: typeof transaction) => Promise<unknown>) => work(transaction)),
} as unknown as Database;
const clock: Clock = { now: () => now };
const taskSchedules = {} as TaskScheduleTable;

function storedTask(overrides: Record<string, unknown> = {}) {
  return {
    id: taskId,
    userId,
    listId,
    sectionId: null,
    parentTaskId: null,
    title: "Ship the demo",
    descriptionMd: "Review the final flow.",
    status: "open",
    priority: "high",
    rank: "a0",
    statusChangedAt: now,
    version: 4,
    createdAt: now,
    updatedAt: now,
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
    startAt: new Date("2026-07-19T06:00:00Z"),
    endAt: new Date("2026-07-19T07:00:00Z"),
    timezone: "Asia/Singapore",
    createdAt: now,
    updatedAt: now,
  };
}

describe("schedule application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositories.tasks.findById.mockResolvedValue(storedTask());
    repositories.tasks.lockById.mockResolvedValue(storedTask());
    repositories.schedules.findByTaskId.mockResolvedValue(timedSchedule());
    repositories.schedules.upsert.mockResolvedValue(timedSchedule());
    repositories.schedules.clear.mockResolvedValue(timedSchedule());
    repositories.schedules.incrementTaskVersion.mockResolvedValue({
      outcome: "applied",
      task: storedTask({ version: 5 }),
    });
    repositories.schedules.listActiveOpenInRange.mockResolvedValue({ items: [], truncated: false });
  });

  it("sets a schedule under a row lock and increments the owning task exactly once", async () => {
    const result = await createTaskScheduleApplication({ database, clock, taskSchedules }).setSchedule(
      actor,
      taskId,
      {
        expectedVersion: 4,
        schedule: {
          kind: "timed",
          startAt: "2026-07-19T14:00:00+08:00",
          endAt: "2026-07-19T15:00:00+08:00",
          timezone: "Asia/Singapore",
        },
      },
    );

    expect(repositories.tasks.lockById).toHaveBeenCalledWith(userId, taskId, "any", transaction);
    expect(repositories.schedules.upsert).toHaveBeenCalledWith(
      {
        userId,
        taskId,
        schedule: {
          kind: "timed",
          startAt: new Date("2026-07-19T06:00:00Z"),
          endAt: new Date("2026-07-19T07:00:00Z"),
          timezone: "Asia/Singapore",
        },
        now,
      },
      transaction,
    );
    expect(repositories.schedules.incrementTaskVersion).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ task: { id: taskId, version: 5 }, schedule: { kind: "timed" } });
    expect(JSON.stringify(result)).not.toContain("userId");
  });

  it("clears an existing schedule and treats an already-unscheduled clear as a conflict", async () => {
    await expect(
      createTaskScheduleApplication({ database, clock, taskSchedules }).clearSchedule(actor, taskId, {
        expectedVersion: 4,
      }),
    ).resolves.toEqual({ task: { id: taskId, version: 5 }, schedule: null });
    expect(repositories.schedules.incrementTaskVersion).toHaveBeenCalledOnce();

    repositories.schedules.clear.mockResolvedValueOnce(null);
    await expect(
      createTaskScheduleApplication({ database, clock, taskSchedules }).clearSchedule(actor, taskId, {
        expectedVersion: 4,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 4 });
  });

  it("rejects cross-user guesses and stale versions before a schedule write", async () => {
    repositories.tasks.lockById.mockResolvedValueOnce(null);
    await expect(
      createTaskScheduleApplication({ database, clock, taskSchedules }).setSchedule(actor, otherTaskId, {
        expectedVersion: 1,
        schedule: { kind: "all_day", startDate: "2026-07-19", endDate: "2026-07-20" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    repositories.tasks.lockById.mockResolvedValueOnce(storedTask({ version: 7 }));
    await expect(
      createTaskScheduleApplication({ database, clock, taskSchedules }).setSchedule(actor, taskId, {
        expectedVersion: 4,
        schedule: { kind: "all_day", startDate: "2026-07-19", endDate: "2026-07-20" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 7 });
    expect(repositories.schedules.upsert).not.toHaveBeenCalled();
  });

  it("maps only active open range rows through separate task and schedule DTOs", async () => {
    repositories.schedules.listActiveOpenInRange.mockResolvedValueOnce({
      items: [{ task: storedTask(), schedule: timedSchedule() }],
      truncated: false,
    });
    const page = await createTaskScheduleApplication({ database, clock, taskSchedules }).listRange(actor, {
      rangeStartDate: "2026-07-19",
      rangeEndDate: "2026-07-20",
      rangeStartAt: "2026-07-18T16:00:00Z",
      rangeEndAt: "2026-07-19T16:00:00Z",
      limit: 250,
    });
    expect(page).toMatchObject({
      items: [{ task: { id: taskId, version: 4 }, schedule: { taskId, kind: "timed" } }],
      truncated: false,
    });
    expect(page.items[0]?.task).not.toHaveProperty("schedule");
  });
});

describe("task snapshot reader", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preserves selection order and returns only minimal task context", async () => {
    repositories.schedules.loadOpenUnscheduled.mockResolvedValue([
      storedTask({ id: otherTaskId, version: 2 }),
      storedTask(),
    ]);
    const result = await createTaskSnapshotReader({ database, taskSchedules }).loadOpenUnscheduled(actor, [
      taskId,
      otherTaskId,
    ]);
    expect(result.map(({ id }) => id)).toEqual([taskId, otherTaskId]);
    expect(result[0]).toEqual({
      id: taskId,
      title: "Ship the demo",
      descriptionMd: "Review the final flow.",
      priority: "high",
      version: 4,
    });
    expect(result[0]).not.toHaveProperty("userId");
    expect(result[0]).not.toHaveProperty("listId");
  });

  it("uses one existence-safe failure for unknown, foreign, terminal, deleted, or scheduled selections", async () => {
    repositories.schedules.loadOpenUnscheduled.mockResolvedValue([storedTask()]);
    await expect(
      createTaskSnapshotReader({ database, taskSchedules }).loadOpenUnscheduled(actor, [taskId, otherTaskId]),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects duplicate or unbounded selections before querying", async () => {
    await expect(
      createTaskSnapshotReader({ database, taskSchedules }).loadOpenUnscheduled(actor, [taskId, taskId]),
    ).rejects.toThrow();
    expect(repositories.schedules.loadOpenUnscheduled).not.toHaveBeenCalled();
  });
});
