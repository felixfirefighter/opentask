import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repositories = vi.hoisted(() => ({
  tasks: { lockById: vi.fn(), incrementVersion: vi.fn() },
  recurrences: { lockByTaskId: vi.fn() },
  schedules: { lockByTaskId: vi.fn() },
  events: { findLatest: vi.fn(), append: vi.fn() },
}));

vi.mock("../infrastructure/task-repository", () => ({
  createTaskRepository: () => repositories.tasks,
}));
vi.mock("../infrastructure/task-recurrence-repository", () => ({
  createTaskRecurrenceRepository: () => repositories.recurrences,
}));
vi.mock("../infrastructure/task-schedule-repository", () => ({
  createTaskScheduleRepository: () => repositories.schedules,
}));
vi.mock("../infrastructure/task-occurrence-event-repository", () => ({
  createTaskOccurrenceEventRepository: () => repositories.events,
}));

import { createOccurrenceCommand } from "./occurrence-command";
import { createOccurrenceKey } from "../domain/recurrence/occurrence-key";
import type { TaskScheduleTable } from "../infrastructure/schema";

const userId = "10000000-0000-4000-8000-000000000001";
const taskId = "20000000-0000-4000-8000-000000000001";
const listId = "30000000-0000-4000-8000-000000000001";
const eventId = "40000000-0000-4000-8000-000000000001";
const actor = { userId };
const now = new Date("2026-07-20T00:00:00.000Z");
const occurrenceKey = createOccurrenceKey(taskId, { kind: "all_day", startDate: "2026-07-21" });
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
    title: "Prepare release",
    descriptionMd: "",
    status: "open",
    priority: "none",
    rank: "a0",
    statusChangedAt: now,
    version: 4,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function storedSchedule() {
  return {
    userId,
    taskId,
    kind: "all_day",
    startDate: "2026-07-20",
    endDate: "2026-07-21",
    startAt: null,
    endAt: null,
    timezone: null,
    createdAt: now,
    updatedAt: now,
  };
}

function storedRecurrence() {
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
    createdAt: now,
    updatedAt: now,
  };
}

function storedEvent(state: "open" | "completed" | "skipped", taskVersion: number) {
  return {
    id: eventId,
    userId,
    taskId,
    occurrenceKey,
    state,
    taskVersion,
    effectiveAt: now,
    createdAt: now,
  };
}

function application() {
  return createOccurrenceCommand({
    database,
    clock,
    taskSchedules,
    createEventId: () => eventId,
  });
}

describe("occurrence command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositories.tasks.lockById.mockResolvedValue(storedTask());
    repositories.tasks.incrementVersion.mockResolvedValue({
      outcome: "applied",
      task: storedTask({ version: 5 }),
    });
    repositories.recurrences.lockByTaskId.mockResolvedValue(storedRecurrence());
    repositories.schedules.lockByTaskId.mockResolvedValue(storedSchedule());
    repositories.events.findLatest.mockResolvedValue(null);
    repositories.events.append.mockImplementation(async (input) => ({
      ...input,
      createdAt: input.effectiveAt,
    }));
  });

  it("completes one eligible occurrence under aggregate lock order and appends one event", async () => {
    const result = await application()(actor, taskId, {
      action: "complete",
      occurrenceKey,
      expectedVersion: 4,
    });

    expect(repositories.tasks.lockById.mock.invocationCallOrder[0]).toBeLessThan(
      repositories.recurrences.lockByTaskId.mock.invocationCallOrder[0]!,
    );
    expect(repositories.recurrences.lockByTaskId.mock.invocationCallOrder[0]).toBeLessThan(
      repositories.schedules.lockByTaskId.mock.invocationCallOrder[0]!,
    );
    expect(repositories.schedules.lockByTaskId.mock.invocationCallOrder[0]).toBeLessThan(
      repositories.events.findLatest.mock.invocationCallOrder[0]!,
    );
    expect(repositories.tasks.incrementVersion).toHaveBeenCalledOnce();
    expect(repositories.events.append).toHaveBeenCalledWith(
      {
        id: eventId,
        userId,
        taskId,
        occurrenceKey,
        state: "completed",
        taskVersion: 5,
        effectiveAt: now,
      },
      transaction,
    );
    expect(result).toMatchObject({
      outcome: "applied",
      occurrenceState: "completed",
      task: { id: taskId, version: 5 },
      eventTaskVersion: 5,
    });
  });

  it("returns the exact response-lost retry even after a later lifecycle mutation", async () => {
    repositories.tasks.lockById.mockResolvedValue(storedTask({ version: 6, status: "cancelled" }));
    repositories.events.findLatest.mockResolvedValue(storedEvent("completed", 5));

    await expect(
      application()(actor, taskId, { action: "complete", occurrenceKey, expectedVersion: 4 }),
    ).resolves.toMatchObject({
      outcome: "idempotent_retry",
      task: { version: 6 },
      eventTaskVersion: 5,
    });
    expect(repositories.tasks.incrementVersion).not.toHaveBeenCalled();
    expect(repositories.events.append).not.toHaveBeenCalled();
  });

  it("returns a same-state no-op without incrementing or appending", async () => {
    repositories.tasks.lockById.mockResolvedValue(storedTask({ version: 5 }));
    repositories.events.findLatest.mockResolvedValue(storedEvent("completed", 5));

    await expect(
      application()(actor, taskId, { action: "complete", occurrenceKey, expectedVersion: 5 }),
    ).resolves.toMatchObject({ outcome: "no_op", eventTaskVersion: 5 });
    expect(repositories.tasks.incrementVersion).not.toHaveBeenCalled();
    expect(repositories.events.append).not.toHaveBeenCalled();
  });

  it("undoes a recorded key without requiring the current rule to emit it", async () => {
    repositories.events.findLatest.mockResolvedValue(storedEvent("skipped", 4));

    await expect(
      application()(actor, taskId, { action: "undo", occurrenceKey, expectedVersion: 4 }),
    ).resolves.toMatchObject({ outcome: "applied", occurrenceState: "open", eventTaskVersion: 5 });
    expect(repositories.events.append).toHaveBeenCalledWith(
      expect.objectContaining({ state: "open", taskVersion: 5 }),
      transaction,
    );
  });

  it("rejects stale different-state commands and cross-user task guesses without writes", async () => {
    repositories.tasks.lockById.mockResolvedValueOnce(storedTask({ version: 6 }));
    repositories.events.findLatest.mockResolvedValueOnce(storedEvent("skipped", 5));
    await expect(
      application()(actor, taskId, { action: "complete", occurrenceKey, expectedVersion: 4 }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 6 });

    repositories.tasks.lockById.mockResolvedValueOnce(null);
    await expect(
      application()(actor, taskId, { action: "skip", occurrenceKey, expectedVersion: 4 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repositories.tasks.incrementVersion).not.toHaveBeenCalled();
    expect(repositories.events.append).not.toHaveBeenCalled();
  });

  it("rejects an extreme client-controlled timed key before opening a transaction", async () => {
    const extremeKey = encodedOccurrenceKey(`${taskId}|t|8640000000000000`);

    await expect(
      application()(actor, taskId, {
        action: "complete",
        occurrenceKey: extremeKey,
        expectedVersion: 4,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(database.transaction).not.toHaveBeenCalled();
  }, 500);

  it("rejects a distant count-exhausted occurrence through direct membership without scanning", async () => {
    repositories.recurrences.lockByTaskId.mockResolvedValue({
      ...storedRecurrence(),
      rrule: "FREQ=DAILY;INTERVAL=1;COUNT=999",
    });
    const distantKey = createOccurrenceKey(taskId, {
      kind: "all_day",
      startDate: "9999-12-31",
    });

    await expect(
      application()(actor, taskId, {
        action: "complete",
        occurrenceKey: distantKey,
        expectedVersion: 4,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(repositories.tasks.incrementVersion).not.toHaveBeenCalled();
    expect(repositories.events.append).not.toHaveBeenCalled();
  }, 500);
});

function encodedOccurrenceKey(payload: string): string {
  return `o1.${btoa(payload).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`;
}
