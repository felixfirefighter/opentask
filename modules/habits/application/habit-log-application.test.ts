import type { Database, DatabaseTransaction } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repositories = vi.hoisted(() => ({
  habits: { lockById: vi.fn() },
  schedules: { lockByHabitId: vi.fn() },
  logs: {
    lockById: vi.fn(),
    lockByHabitDate: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock("../infrastructure/habit-repository", () => ({
  createHabitRepository: () => repositories.habits,
}));
vi.mock("../infrastructure/habit-schedule-repository", () => ({
  createHabitScheduleRepository: () => repositories.schedules,
}));
vi.mock("../infrastructure/habit-log-repository", () => ({
  createHabitLogRepository: () => repositories.logs,
}));

import { createHabitLogApplication } from "./habit-log-application";

const userId = "10000000-0000-4000-8000-000000000001";
const habitId = "20000000-0000-4000-8000-000000000001";
const logId = "30000000-0000-4000-8000-000000000001";
const otherLogId = "30000000-0000-4000-8000-000000000002";
const actor = { userId };
const now = new Date("2026-07-20T16:30:00.000Z");
const transaction = { execute: vi.fn() } as unknown as DatabaseTransaction;
const database = {
  transaction: vi.fn(async (work: (executor: DatabaseTransaction) => Promise<unknown>) => work(transaction)),
} as unknown as Database;
const clock: Clock = { now: vi.fn(() => now) };

function storedHabit(overrides: Record<string, unknown> = {}) {
  return {
    id: habitId,
    userId,
    title: "Drink water",
    icon: "💧",
    colorToken: "sky",
    goalKind: "quantity",
    targetValue: 2.5,
    unit: "litres",
    version: 3,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    ...overrides,
  };
}

function storedSchedule(overrides: Record<string, unknown> = {}) {
  return {
    userId,
    habitId,
    kind: "daily",
    weekdays: null,
    targetPerWeek: null,
    timezone: "Asia/Singapore",
    startDate: "2026-07-01",
    endDate: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function storedLog(overrides: Record<string, unknown> = {}) {
  return {
    id: logId,
    userId,
    habitId,
    localDate: "2026-07-21",
    state: "completed",
    quantity: 2.5,
    note: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("habit log application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositories.habits.lockById.mockResolvedValue(storedHabit());
    repositories.schedules.lockByHabitId.mockResolvedValue(storedSchedule());
    repositories.logs.lockById.mockResolvedValue(null);
    repositories.logs.lockByHabitDate.mockResolvedValue(null);
    repositories.logs.insert.mockResolvedValue(storedLog());
  });

  it("records a scheduled non-future day in the habit timezone under the actor", async () => {
    const result = await createHabitLogApplication({ database, clock }).recordHabitDay(
      actor,
      habitId,
      logId,
      {
        localDate: "2026-07-21",
        value: { state: "completed", quantity: 2.5, note: "  on target  " },
      },
    );

    expect(result).toMatchObject({
      outcome: "created",
      log: {
        id: logId,
        habitId,
        localDate: "2026-07-21",
        quantity: 2.5,
        successful: true,
      },
    });
    expect(repositories.habits.lockById).toHaveBeenCalledWith(userId, habitId, transaction);
    expect(repositories.schedules.lockByHabitId).toHaveBeenCalledWith(userId, habitId, transaction);
    expect(repositories.logs.insert).toHaveBeenCalledWith(
      {
        id: logId,
        userId,
        habitId,
        localDate: "2026-07-21",
        value: { state: "completed", quantity: 2.5, note: "  on target  " },
        now,
      },
      transaction,
    );
  });

  it.each([
    {
      label: "future local day",
      schedule: storedSchedule(),
      localDate: "2026-07-22",
    },
    {
      label: "unscheduled weekday",
      schedule: storedSchedule({ kind: "weekdays", weekdays: [1], targetPerWeek: null }),
      localDate: "2026-07-19",
    },
  ])("rejects a new log for a $label before persistence", async ({ schedule, localDate }) => {
    repositories.schedules.lockByHabitId.mockResolvedValue(schedule);

    await expect(
      createHabitLogApplication({ database, clock }).recordHabitDay(actor, habitId, logId, {
        localDate,
        value: { state: "completed", quantity: 2.5, note: null },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(repositories.logs.insert).not.toHaveBeenCalled();
  });

  it("treats only an exact same-id same-day same-value retry as idempotent", async () => {
    repositories.logs.lockById.mockResolvedValue(storedLog());
    const application = createHabitLogApplication({ database, clock });

    await expect(
      application.recordHabitDay(actor, habitId, logId, {
        localDate: "2026-07-21",
        value: { state: "completed", quantity: 2.5, note: null },
      }),
    ).resolves.toMatchObject({ outcome: "idempotent_retry", log: { id: logId } });
    expect(repositories.logs.insert).not.toHaveBeenCalled();

    repositories.logs.lockById.mockResolvedValue(null);
    repositories.logs.lockByHabitDate.mockResolvedValue(storedLog());
    await expect(
      application.recordHabitDay(actor, habitId, otherLogId, {
        localDate: "2026-07-21",
        value: { state: "completed", quantity: 2.5, note: null },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 1 });

    repositories.logs.lockById.mockResolvedValue(storedLog());
    await expect(
      application.recordHabitDay(actor, habitId, logId, {
        localDate: "2026-07-21",
        value: { state: "completed", quantity: 2.4, note: null },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 1 });
  });

  it("edits an existing log after schedule changes and derives success from the current goal", async () => {
    repositories.habits.lockById.mockResolvedValue(storedHabit({ targetValue: 3 }));
    repositories.logs.lockByHabitDate.mockResolvedValue(storedLog({ localDate: "2026-06-01" }));
    repositories.logs.update.mockResolvedValue({
      outcome: "applied",
      log: storedLog({
        localDate: "2026-06-01",
        quantity: 3,
        note: "Updated",
        version: 2,
      }),
    });

    const result = await createHabitLogApplication({ database, clock }).editHabitDay(
      actor,
      habitId,
      "2026-06-01",
      {
        expectedVersion: 1,
        value: { state: "completed", quantity: 3, note: "Updated" },
      },
    );

    expect(result).toMatchObject({ version: 2, quantity: 3, successful: true });
    expect(repositories.schedules.lockByHabitId).not.toHaveBeenCalled();
    expect(repositories.logs.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId, habitId, localDate: "2026-06-01", expectedVersion: 1, now }),
      transaction,
    );
  });

  it("undoes an existing log after schedule changes while preserving optimistic version checks", async () => {
    repositories.logs.lockByHabitDate.mockResolvedValue(storedLog({ localDate: "2026-06-01", version: 4 }));
    repositories.logs.remove.mockResolvedValue({
      outcome: "applied",
      log: storedLog({ localDate: "2026-06-01", version: 4 }),
    });

    await expect(
      createHabitLogApplication({ database, clock }).undoHabitDay(actor, habitId, "2026-06-01", {
        expectedVersion: 4,
      }),
    ).resolves.toMatchObject({ id: logId, localDate: "2026-06-01", version: 4 });
    expect(repositories.schedules.lockByHabitId).not.toHaveBeenCalled();
    expect(repositories.logs.remove).toHaveBeenCalledWith(
      { userId, habitId, localDate: "2026-06-01", expectedVersion: 4 },
      transaction,
    );
  });

  it("blocks create, edit, and undo when the owning habit is archived", async () => {
    repositories.habits.lockById.mockResolvedValue(storedHabit({ archivedAt: now }));
    const application = createHabitLogApplication({ database, clock });

    await expect(
      application.recordHabitDay(actor, habitId, logId, {
        localDate: "2026-07-21",
        value: { state: "completed", quantity: 2.5, note: null },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 3 });
    await expect(
      application.editHabitDay(actor, habitId, "2026-07-21", {
        expectedVersion: 1,
        value: { state: "completed", quantity: 2.5, note: null },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 3 });
    await expect(
      application.undoHabitDay(actor, habitId, "2026-07-21", { expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 3 });
    expect(repositories.logs.insert).not.toHaveBeenCalled();
    expect(repositories.logs.update).not.toHaveBeenCalled();
    expect(repositories.logs.remove).not.toHaveBeenCalled();
  });
});
