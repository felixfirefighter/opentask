import type { Database, DatabaseTransaction } from "@/shared/db/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RruleRecurrenceExpander } from "../infrastructure/recurrence/rrule-expander";
import type { TaskScheduleTable } from "../infrastructure/schema";

const repositories = vi.hoisted(() => ({
  recurrences: { lockByTaskId: vi.fn(), replace: vi.fn() },
  schedules: { lockByTaskId: vi.fn() },
}));

vi.mock("../infrastructure/task-recurrence-repository", () => ({
  createTaskRecurrenceRepository: () => repositories.recurrences,
}));
vi.mock("../infrastructure/task-schedule-repository", () => ({
  createTaskScheduleRepository: () => repositories.schedules,
}));

import { createTaskRecurrenceLifecycle } from "./task-recurrence-lifecycle";

const userId = "10000000-0000-4000-8000-000000000001";
const taskId = "30000000-0000-4000-8000-000000000001";
const now = new Date("2026-07-19T01:02:03.000Z");
const transaction = {} as DatabaseTransaction;
const lifecycle = createTaskRecurrenceLifecycle({
  database: {} as Database,
  expansion: new RruleRecurrenceExpander(),
  taskSchedules: {} as TaskScheduleTable,
});

describe("recurring task lifecycle coordinator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositories.recurrences.lockByTaskId.mockResolvedValue(null);
    repositories.recurrences.replace.mockResolvedValue(null);
    repositories.schedules.lockByTaskId.mockResolvedValue(null);
  });

  it("locks recurrence before schedule for every task lifecycle command", async () => {
    await expect(lifecycle.lockResources(userId, taskId, transaction)).resolves.toEqual({
      recurrence: null,
      schedule: null,
    });
    expect(repositories.recurrences.lockByTaskId.mock.invocationCallOrder[0]).toBeLessThan(
      repositories.schedules.lockByTaskId.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it("rejects owner completion until the recurrence is explicitly ended", () => {
    expect(() => lifecycle.assertCompletionAllowed(storedRecurrence(), 7)).toThrow(
      expect.objectContaining({ code: "CONFLICT", currentVersion: 7 }),
    );
    expect(() =>
      lifecycle.assertCompletionAllowed(storedRecurrence({ projectionEndDate: "2026-07-19" }), 7),
    ).not.toThrow();
    expect(() => lifecycle.assertCompletionAllowed(null, 7)).not.toThrow();
  });

  it("advances only an active dormant recurrence to the first strict future occurrence", async () => {
    const recurrence = storedRecurrence();
    const schedule = storedSchedule();
    repositories.recurrences.replace.mockImplementation(
      async ({ recurrence: write }: { recurrence: { cutover: { projectionStartDate: string } } }) =>
        storedRecurrence({ projectionStartDate: write.cutover.projectionStartDate }),
    );

    await lifecycle.advanceForResume(userId, { recurrence, schedule }, now, transaction);

    expect(repositories.recurrences.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        taskId,
        recurrence: expect.objectContaining({
          cutover: { kind: "all_day", projectionStartDate: "2026-07-20", projectionEndDate: null },
        }),
      }),
      transaction,
    );

    repositories.recurrences.replace.mockClear();
    await lifecycle.advanceForResume(
      userId,
      { recurrence: storedRecurrence({ projectionEndDate: "2026-07-19" }), schedule },
      now,
      transaction,
    );
    expect(repositories.recurrences.replace).not.toHaveBeenCalled();
  });

  it("fails closed when recurrence storage has lost its canonical schedule", async () => {
    repositories.recurrences.lockByTaskId.mockResolvedValue(storedRecurrence());
    await expect(lifecycle.lockResources(userId, taskId, transaction)).rejects.toThrow(
      "missing its canonical schedule",
    );
  });
});

function storedRecurrence(overrides: Record<string, unknown> = {}) {
  return {
    userId,
    taskId,
    rrule: "FREQ=DAILY;INTERVAL=1",
    timezone: "Asia/Singapore",
    generationMode: "schedule",
    projectionStartDate: "2026-07-10",
    projectionStartAt: null,
    projectionEndDate: null,
    projectionEndAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function storedSchedule() {
  return {
    userId,
    taskId,
    kind: "all_day",
    startDate: "2026-07-10",
    endDate: "2026-07-11",
    startAt: null,
    endAt: null,
    timezone: null,
    createdAt: now,
    updatedAt: now,
  };
}
