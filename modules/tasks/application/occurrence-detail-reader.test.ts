import type { Database, DatabaseTransaction } from "@/shared/db/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repositories = vi.hoisted(() => ({
  events: { findLatest: vi.fn() },
  recurrences: { findByTaskId: vi.fn() },
  schedules: { findByTaskId: vi.fn() },
  tasks: { findById: vi.fn() },
}));
const repositoryFactories = vi.hoisted(() => ({
  events: vi.fn(),
  recurrences: vi.fn(),
  schedules: vi.fn(),
  tasks: vi.fn(),
}));

vi.mock("../infrastructure/task-occurrence-event-repository", () => ({
  createTaskOccurrenceEventRepository: (executor: unknown) =>
    repositoryFactories.events(executor) ?? repositories.events,
}));
vi.mock("../infrastructure/task-recurrence-repository", () => ({
  createTaskRecurrenceRepository: (executor: unknown) =>
    repositoryFactories.recurrences(executor) ?? repositories.recurrences,
}));
vi.mock("../infrastructure/task-schedule-repository", () => ({
  createTaskScheduleRepository: (table: unknown, executor: unknown) =>
    repositoryFactories.schedules(table, executor) ?? repositories.schedules,
}));
vi.mock("../infrastructure/task-repository", () => ({
  createTaskRepository: (executor: unknown) => repositoryFactories.tasks(executor) ?? repositories.tasks,
}));

import { createOccurrenceDetailReader } from "./occurrence-detail-reader";
import { createPostgresTaskReadSnapshot, type TaskReadSnapshot } from "./task-read-snapshot";
import { createOccurrenceKey, createProjectedOccurrenceKey } from "../domain/recurrence/occurrence-key";
import type { TaskScheduleTable } from "../infrastructure/schema";

const userId = "10000000-0000-4000-8000-000000000001";
const taskId = "20000000-0000-4000-8000-000000000001";
const otherTaskId = "20000000-0000-4000-8000-000000000002";
const occurrenceKey = createOccurrenceKey(taskId, { kind: "all_day", startDate: "2026-07-21" });
const now = new Date("2026-07-20T00:00:00.000Z");
const transaction = {} as DatabaseTransaction;
const taskSchedules = {} as TaskScheduleTable;

function reader(snapshot: TaskReadSnapshot = immediateSnapshot(transaction)) {
  return createOccurrenceDetailReader({
    snapshot,
    taskSchedules,
  });
}

describe("occurrence detail reader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositories.tasks.findById.mockResolvedValue(taskRow(4));
    repositories.schedules.findByTaskId.mockResolvedValue(allDaySchedule());
    repositories.recurrences.findByTaskId.mockResolvedValue(storedRecurrence());
    repositories.events.findLatest.mockResolvedValue(null);
  });

  it("opens PostgreSQL occurrence reads as repeatable-read, read-only snapshots", async () => {
    const work = vi.fn(async (received: DatabaseTransaction) => {
      expect(received).toBe(transaction);
      return "snapshot result";
    });
    const databaseTransaction = vi.fn(
      async (...args: [(received: DatabaseTransaction) => Promise<string>, unknown]) => args[0](transaction),
    );
    const snapshot = createPostgresTaskReadSnapshot({
      transaction: databaseTransaction,
    } as unknown as Database);

    await expect(snapshot.run(work)).resolves.toBe("snapshot result");
    expect(databaseTransaction).toHaveBeenCalledWith(work, {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
  });

  it("returns an authorized current occurrence with its authoritative schedule and state", async () => {
    const result = await reader()({ userId }, taskId, occurrenceKey);

    expect(result).toEqual({
      taskId,
      taskVersion: 4,
      occurrenceKey,
      occurrenceState: "open",
      transitionEligible: true,
      schedule: { kind: "all_day", startDate: "2026-07-21", endDate: "2026-07-22" },
    });
    expect(repositories.tasks.findById).toHaveBeenCalledWith(userId, taskId, "active");
    expect(repositories.events.findLatest).toHaveBeenCalledWith(userId, taskId, occurrenceKey);
    expect(repositoryFactories.tasks).toHaveBeenCalledWith(transaction);
    expect(repositoryFactories.recurrences).toHaveBeenCalledWith(transaction);
    expect(repositoryFactories.schedules).toHaveBeenCalledWith(taskSchedules, transaction);
    expect(repositoryFactories.events).toHaveBeenCalledWith(transaction);
    expect(repositories.tasks.findById.mock.invocationCallOrder[0]).toBeLessThan(
      repositories.recurrences.findByTaskId.mock.invocationCallOrder[0]!,
    );
    expect(repositories.recurrences.findByTaskId.mock.invocationCallOrder[0]).toBeLessThan(
      repositories.schedules.findByTaskId.mock.invocationCallOrder[0]!,
    );
    expect(repositories.schedules.findByTaskId.mock.invocationCallOrder[0]).toBeLessThan(
      repositories.events.findLatest.mock.invocationCallOrder[0]!,
    );
  });

  it("cannot pair a post-commit task version with a pre-commit occurrence state", async () => {
    const snapshotView = {
      taskVersion: 4,
      occurrenceState: "skipped" as const,
      eventTaskVersion: 4,
    };
    const committedView = {
      taskVersion: 4,
      occurrenceState: "skipped" as "completed" | "skipped",
      eventTaskVersion: 4,
    };
    const snapshotTransaction = { snapshotView } as unknown as DatabaseTransaction;
    repositoryFactories.tasks.mockImplementationOnce((executor) => ({
      findById: async () => {
        expect(executor).toBe(snapshotTransaction);
        committedView.taskVersion = 5;
        committedView.occurrenceState = "completed";
        committedView.eventTaskVersion = 5;
        return taskRow(snapshotView.taskVersion);
      },
    }));
    repositoryFactories.events.mockImplementationOnce((executor) => ({
      findLatest: async () => {
        expect(executor).toBe(snapshotTransaction);
        return occurrenceEvent(snapshotView.occurrenceState, snapshotView.eventTaskVersion);
      },
    }));

    const result = await reader(immediateSnapshot(snapshotTransaction))({ userId }, taskId, occurrenceKey);

    expect(committedView).toEqual({
      taskVersion: 5,
      occurrenceState: "completed",
      eventTaskVersion: 5,
    });
    expect(result).toMatchObject({ taskVersion: 4, occurrenceState: "skipped" });
    expect(result).not.toMatchObject({ taskVersion: 5, occurrenceState: "skipped" });
  });

  it("retains a recorded terminal occurrence even after the current rule no longer emits it", async () => {
    repositories.recurrences.findByTaskId.mockResolvedValueOnce({
      ...storedRecurrence(),
      projectionStartDate: "2026-07-22",
    });
    repositories.events.findLatest.mockResolvedValueOnce({
      id: "40000000-0000-4000-8000-000000000001",
      userId,
      taskId,
      occurrenceKey,
      state: "skipped",
      taskVersion: 3,
      effectiveAt: now,
      createdAt: now,
    });

    await expect(reader()({ userId }, taskId, occurrenceKey)).resolves.toMatchObject({
      occurrenceState: "skipped",
      transitionEligible: false,
      schedule: { startDate: "2026-07-21" },
    });
  });

  it("returns an undone historical occurrence as open but transition-ineligible", async () => {
    repositories.recurrences.findByTaskId.mockResolvedValueOnce({
      ...storedRecurrence(),
      projectionStartDate: "2026-07-22",
    });
    repositories.events.findLatest.mockResolvedValueOnce({
      id: "40000000-0000-4000-8000-000000000002",
      userId,
      taskId,
      occurrenceKey,
      state: "open",
      taskVersion: 4,
      effectiveAt: now,
      createdAt: now,
    });

    await expect(reader()({ userId }, taskId, occurrenceKey)).resolves.toMatchObject({
      occurrenceState: "open",
      transitionEligible: false,
      schedule: { startDate: "2026-07-21" },
    });
  });

  it("preserves a date-crossing gap key when projecting occurrence detail", async () => {
    const gapKey = createProjectedOccurrenceKey(
      taskId,
      { kind: "timed", startAt: "2011-12-30T19:00:00Z" },
      { kind: "timed", startLocalDateTime: "2011-12-30T09:00" },
      "Pacific/Apia",
    );
    repositories.schedules.findByTaskId.mockResolvedValueOnce({
      userId,
      taskId,
      kind: "timed",
      startDate: null,
      endDate: null,
      startAt: new Date("2011-12-29T19:00:00Z"),
      endAt: new Date("2011-12-29T20:00:00Z"),
      timezone: "Pacific/Apia",
      createdAt: now,
      updatedAt: now,
    });
    repositories.recurrences.findByTaskId.mockResolvedValueOnce({
      ...storedRecurrence(),
      timezone: "Pacific/Apia",
      projectionStartDate: null,
      projectionStartAt: new Date("2011-12-29T19:00:00Z"),
    });

    await expect(reader()({ userId }, taskId, gapKey)).resolves.toMatchObject({
      occurrenceKey: gapKey,
      occurrenceState: "open",
      transitionEligible: true,
      schedule: { kind: "timed", startAt: "2011-12-30T19:00:00Z" },
    });
  });

  it("returns no detail for malformed, foreign, unauthorized, or ineligible identities", async () => {
    await expect(reader()({ userId }, taskId, "not-an-occurrence")).resolves.toBeNull();
    await expect(
      reader()(
        { userId },
        taskId,
        createOccurrenceKey(otherTaskId, { kind: "all_day", startDate: "2026-07-21" }),
      ),
    ).resolves.toBeNull();

    repositories.tasks.findById.mockResolvedValueOnce(null);
    await expect(reader()({ userId }, taskId, occurrenceKey)).resolves.toBeNull();

    repositories.recurrences.findByTaskId.mockResolvedValueOnce({
      ...storedRecurrence(),
      projectionStartDate: "2026-07-22",
    });
    await expect(reader()({ userId }, taskId, occurrenceKey)).resolves.toBeNull();
  });
});

function storedRecurrence() {
  return {
    userId,
    taskId,
    rrule: "FREQ=DAILY;INTERVAL=1",
    timezone: "Asia/Singapore",
    generationMode: "schedule",
    projectionStartDate: "2026-07-19",
    projectionStartAt: null,
    projectionEndDate: null,
    projectionEndAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function immediateSnapshot(transaction: DatabaseTransaction): TaskReadSnapshot {
  return { run: (work) => work(transaction) };
}

function taskRow(version: number) {
  return {
    id: taskId,
    userId,
    listId: "30000000-0000-4000-8000-000000000001",
    sectionId: null,
    parentTaskId: null,
    title: "Daily review",
    descriptionMd: "",
    status: "open",
    priority: "none",
    rank: "a0",
    statusChangedAt: now,
    version,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  } as const;
}

function allDaySchedule() {
  return {
    userId,
    taskId,
    kind: "all_day",
    startDate: "2026-07-19",
    endDate: "2026-07-20",
    startAt: null,
    endAt: null,
    timezone: null,
    createdAt: now,
    updatedAt: now,
  } as const;
}

function occurrenceEvent(state: "completed" | "skipped", taskVersion: number) {
  return {
    id: "40000000-0000-4000-8000-000000000003",
    userId,
    taskId,
    occurrenceKey,
    state,
    taskVersion,
    effectiveAt: now,
    createdAt: now,
  } as const;
}
