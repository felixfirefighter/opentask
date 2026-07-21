import type { Database } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repositories = vi.hoisted(() => ({
  tasks: { findById: vi.fn(), lockById: vi.fn(), incrementVersion: vi.fn() },
  schedules: { findByTaskId: vi.fn(), lockByTaskId: vi.fn(), upsert: vi.fn() },
  recurrences: {
    findByTaskId: vi.fn(),
    lockByTaskId: vi.fn(),
    insert: vi.fn(),
    replace: vi.fn(),
  },
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

import { createTaskRecurrenceApplication } from "./recurrence-application";
import type { RecurrenceExpansionPort } from "./recurrence-expansion-port";
import type { TaskScheduleTable } from "../infrastructure/schema";

const userId = "10000000-0000-4000-8000-000000000001";
const taskId = "20000000-0000-4000-8000-000000000001";
const listId = "30000000-0000-4000-8000-000000000001";
const actor = { userId };
const now = new Date("2026-07-20T00:00:00.000Z");
const transaction = { execute: vi.fn() };
const database = {
  transaction: vi.fn(async (work: (executor: typeof transaction) => Promise<unknown>) => work(transaction)),
} as unknown as Database;
const clock: Clock = { now: () => now };
const taskSchedules = {} as TaskScheduleTable;
const expansion: RecurrenceExpansionPort = {
  expand: vi.fn(),
  next: vi.fn((request) =>
    request.anchor.kind === "all_day"
      ? { kind: "all_day" as const, startDate: "2026-07-21" }
      : { kind: "timed" as const, startLocalDateTime: "2026-07-21T09:00" },
  ),
};
const resolveUserTimezone = vi.fn(async () => "Asia/Singapore");

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

function timedSchedule(overrides: Record<string, unknown> = {}) {
  return {
    userId,
    taskId,
    kind: "timed",
    startDate: null,
    endDate: null,
    startAt: new Date("2026-07-21T01:00:00.000Z"),
    endAt: new Date("2026-07-21T02:00:00.000Z"),
    timezone: "Asia/Singapore",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function allDaySchedule(overrides: Record<string, unknown> = {}) {
  return {
    userId,
    taskId,
    kind: "all_day",
    startDate: "2026-07-21",
    endDate: "2026-07-22",
    startAt: null,
    endAt: null,
    timezone: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function storedRecurrence(overrides: Record<string, unknown> = {}) {
  return {
    userId,
    taskId,
    rrule: "FREQ=DAILY;INTERVAL=1",
    timezone: "Asia/Singapore",
    generationMode: "schedule",
    projectionStartDate: null,
    projectionStartAt: new Date("2026-07-21T01:00:00.000Z"),
    projectionEndDate: null,
    projectionEndAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function storedFromWrite(input: {
  recurrence: {
    rrule: string;
    timezone: string;
    cutover:
      | { kind: "all_day"; projectionStartDate: string; projectionEndDate: string | null }
      | { kind: "timed"; projectionStartAt: Date; projectionEndAt: Date | null };
  };
}) {
  const cutover = input.recurrence.cutover;
  return storedRecurrence({
    rrule: input.recurrence.rrule,
    timezone: input.recurrence.timezone,
    projectionStartDate: cutover.kind === "all_day" ? cutover.projectionStartDate : null,
    projectionStartAt: cutover.kind === "timed" ? cutover.projectionStartAt : null,
    projectionEndDate: cutover.kind === "all_day" ? cutover.projectionEndDate : null,
    projectionEndAt: cutover.kind === "timed" ? cutover.projectionEndAt : null,
  });
}

describe("recurrence application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositories.tasks.findById.mockResolvedValue(storedTask());
    repositories.tasks.lockById.mockResolvedValue(storedTask());
    repositories.tasks.incrementVersion.mockResolvedValue({
      outcome: "applied",
      task: storedTask({ version: 5 }),
    });
    repositories.schedules.findByTaskId.mockResolvedValue(timedSchedule());
    repositories.schedules.lockByTaskId.mockResolvedValue(timedSchedule());
    repositories.schedules.upsert.mockResolvedValue(timedSchedule());
    repositories.recurrences.findByTaskId.mockResolvedValue(null);
    repositories.recurrences.lockByTaskId.mockResolvedValue(null);
    repositories.recurrences.insert.mockImplementation(async (input) => storedFromWrite(input));
    repositories.recurrences.replace.mockImplementation(async (input) => storedFromWrite(input));
  });

  it("reads the recurrence aggregate from one repeatable-read snapshot", async () => {
    repositories.recurrences.findByTaskId.mockResolvedValueOnce(storedRecurrence());

    const result = await createTaskRecurrenceApplication({
      database,
      clock,
      taskSchedules,
      expansion,
      resolveUserTimezone,
    }).getRecurrence(actor, taskId);

    expect(result).toMatchObject({ taskId, taskVersion: 4, lifecycle: "active" });
    expect(database.transaction).toHaveBeenCalledWith(expect.anything(), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
    expect(repositories.tasks.findById).toHaveBeenCalledWith(userId, taskId, "any", transaction);
    expect(repositories.recurrences.findByTaskId).toHaveBeenCalledWith(userId, taskId, transaction);
    expect(repositories.schedules.findByTaskId).toHaveBeenCalledWith(userId, taskId, transaction);
    expect(repositories.tasks.findById.mock.invocationCallOrder[0]).toBeLessThan(
      repositories.recurrences.findByTaskId.mock.invocationCallOrder[0]!,
    );
    expect(repositories.recurrences.findByTaskId.mock.invocationCallOrder[0]).toBeLessThan(
      repositories.schedules.findByTaskId.mock.invocationCallOrder[0]!,
    );
  });

  it("creates an anchored rule under the aggregate lock order and increments once", async () => {
    const application = createTaskRecurrenceApplication({
      database,
      clock,
      taskSchedules,
      expansion,
      resolveUserTimezone,
    });
    const result = await application.setRecurrence(actor, taskId, {
      expectedVersion: 4,
      definition: { preset: { kind: "daily", interval: 1 }, end: { kind: "never" } },
    });

    expect(repositories.tasks.lockById.mock.invocationCallOrder[0]).toBeLessThan(
      repositories.recurrences.lockByTaskId.mock.invocationCallOrder[0]!,
    );
    expect(resolveUserTimezone.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(database.transaction).mock.invocationCallOrder[0]!,
    );
    expect(repositories.recurrences.lockByTaskId.mock.invocationCallOrder[0]).toBeLessThan(
      repositories.schedules.lockByTaskId.mock.invocationCallOrder[0]!,
    );
    expect(repositories.recurrences.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        taskId,
        recurrence: expect.objectContaining({
          rrule: "FREQ=DAILY;INTERVAL=1",
          cutover: {
            kind: "timed",
            projectionStartAt: new Date("2026-07-21T01:00:00.000Z"),
            projectionEndAt: null,
          },
        }),
      }),
      transaction,
    );
    expect(repositories.tasks.incrementVersion).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      task: { id: taskId, version: 5 },
      recurrence: { lifecycle: "active", taskVersion: 5 },
    });
  });

  it("restarts an ended rule at the first strictly future occurrence", async () => {
    repositories.recurrences.lockByTaskId.mockResolvedValue(
      storedRecurrence({ projectionEndAt: new Date("2026-07-22T01:00:00.000Z") }),
    );
    await createTaskRecurrenceApplication({
      database,
      clock,
      taskSchedules,
      expansion,
      resolveUserTimezone,
    }).setRecurrence(actor, taskId, {
      expectedVersion: 4,
      definition: { preset: { kind: "daily", interval: 1 }, end: { kind: "never" } },
    });

    expect(repositories.recurrences.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrence: expect.objectContaining({
          cutover: {
            kind: "timed",
            projectionStartAt: new Date("2026-07-21T01:00:00.000Z"),
            projectionEndAt: null,
          },
        }),
      }),
      transaction,
    );
  });

  it("atomically changes the recurring schedule before replacing the rule", async () => {
    repositories.recurrences.lockByTaskId.mockResolvedValue(storedRecurrence());
    await createTaskRecurrenceApplication({
      database,
      clock,
      taskSchedules,
      expansion,
      resolveUserTimezone,
    }).editRecurringSchedule(actor, taskId, {
      expectedVersion: 4,
      definition: { preset: { kind: "daily", interval: 1 }, end: { kind: "never" } },
      schedule: {
        kind: "timed",
        startAt: "2026-07-21T01:00:00.000Z",
        endAt: "2026-07-21T02:00:00.000Z",
        timezone: "Asia/Singapore",
      },
    });

    expect(repositories.schedules.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      repositories.recurrences.replace.mock.invocationCallOrder[0]!,
    );
    expect(repositories.tasks.incrementVersion).toHaveBeenCalledOnce();
    expect(resolveUserTimezone).not.toHaveBeenCalled();
  });

  it("resolves an all-day edit timezone before opening the write transaction", async () => {
    repositories.schedules.lockByTaskId.mockResolvedValue(allDaySchedule());
    repositories.schedules.upsert.mockResolvedValue(allDaySchedule());
    repositories.schedules.findByTaskId.mockResolvedValue(allDaySchedule());
    repositories.recurrences.lockByTaskId.mockResolvedValue(
      storedRecurrence({ projectionStartDate: "2026-07-21", projectionStartAt: null }),
    );

    await createTaskRecurrenceApplication({
      database,
      clock,
      taskSchedules,
      expansion,
      resolveUserTimezone,
    }).editRecurringSchedule(actor, taskId, {
      expectedVersion: 4,
      definition: { preset: { kind: "daily", interval: 1 }, end: { kind: "never" } },
      schedule: { kind: "all_day", startDate: "2026-07-21", endDate: "2026-07-22" },
    });

    expect(resolveUserTimezone).toHaveBeenCalledOnce();
    expect(resolveUserTimezone.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(database.transaction).mock.invocationCallOrder[0]!,
    );
    expect(repositories.tasks.lockById.mock.invocationCallOrder[0]).toBeGreaterThan(
      resolveUserTimezone.mock.invocationCallOrder[0]!,
    );
  });

  it.each([
    {
      direction: "all-day to timed",
      currentSchedule: allDaySchedule(),
      currentRecurrence: storedRecurrence({
        projectionStartDate: "2026-07-21",
        projectionStartAt: null,
      }),
      nextSchedule: {
        kind: "timed" as const,
        startAt: "2026-07-21T01:00:00.000Z",
        endAt: "2026-07-21T02:00:00.000Z",
        timezone: "Asia/Singapore",
      },
    },
    {
      direction: "timed to all-day",
      currentSchedule: timedSchedule(),
      currentRecurrence: storedRecurrence(),
      nextSchedule: {
        kind: "all_day" as const,
        startDate: "2026-07-21",
        endDate: "2026-07-22",
      },
    },
  ])("rejects a $direction recurring schedule kind change before persistence", async (fixture) => {
    repositories.schedules.lockByTaskId.mockResolvedValue(fixture.currentSchedule);
    repositories.recurrences.lockByTaskId.mockResolvedValue(fixture.currentRecurrence);

    await expect(
      createTaskRecurrenceApplication({
        database,
        clock,
        taskSchedules,
        expansion,
        resolveUserTimezone,
      }).editRecurringSchedule(actor, taskId, {
        expectedVersion: 4,
        definition: { preset: { kind: "daily", interval: 1 }, end: { kind: "never" } },
        schedule: fixture.nextSchedule,
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      message:
        "A recurring schedule must keep its all-day or specific-time type to preserve occurrence history.",
    });

    expect(repositories.schedules.upsert).not.toHaveBeenCalled();
    expect(repositories.recurrences.replace).not.toHaveBeenCalled();
    expect(repositories.tasks.incrementVersion).not.toHaveBeenCalled();
  });

  it("ends with the documented no-candidate fallback and rejects cross-user guesses", async () => {
    repositories.schedules.lockByTaskId.mockResolvedValue(
      timedSchedule({
        startAt: new Date("2026-07-19T01:00:00.000Z"),
        endAt: new Date("2026-07-19T02:00:00.000Z"),
      }),
    );
    repositories.schedules.findByTaskId.mockResolvedValue(
      timedSchedule({
        startAt: new Date("2026-07-19T01:00:00.000Z"),
        endAt: new Date("2026-07-19T02:00:00.000Z"),
      }),
    );
    repositories.recurrences.lockByTaskId.mockResolvedValue(
      storedRecurrence({ projectionStartAt: new Date("2026-07-19T01:00:00.000Z") }),
    );
    vi.mocked(expansion.next).mockReturnValueOnce(null);
    await createTaskRecurrenceApplication({
      database,
      clock,
      taskSchedules,
      expansion,
      resolveUserTimezone,
    }).endRecurrence(actor, taskId, { expectedVersion: 4 });
    expect(repositories.recurrences.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrence: expect.objectContaining({
          cutover: expect.objectContaining({ projectionEndAt: now }),
        }),
      }),
      transaction,
    );

    repositories.tasks.lockById.mockResolvedValueOnce(null);
    await expect(
      createTaskRecurrenceApplication({
        database,
        clock,
        taskSchedules,
        expansion,
        resolveUserTimezone,
      }).setRecurrence(actor, taskId, {
        expectedVersion: 4,
        definition: { preset: { kind: "daily", interval: 1 }, end: { kind: "never" } },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repositories.recurrences.insert).toHaveBeenCalledTimes(0);
  });
});
