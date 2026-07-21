import type { Database, DatabaseTransaction } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repositories = vi.hoisted(() => ({
  habits: { findById: vi.fn(), findPageAnchor: vi.fn(), listPageByLifecycle: vi.fn() },
  schedules: {
    findByHabitId: vi.fn(),
    listDistinctActiveTimezones: vi.fn(),
    listForHabitIds: vi.fn(),
  },
  logs: { listProjectionPage: vi.fn(), listRangeByHabit: vi.fn() },
}));

vi.mock("../infrastructure/habit-repository", () => ({
  createHabitRepository: () => repositories.habits,
}));
vi.mock("../infrastructure/habit-schedule-repository", () => ({
  createHabitScheduleRepository: () => repositories.schedules,
}));
vi.mock("../infrastructure/habit-log-repository", () => ({
  HABIT_LOG_PROJECTION_BATCH_SIZE: 256,
  createHabitLogRepository: () => repositories.logs,
}));

import { createHabitProjectionApplication } from "./habit-projection-application";

const userId = "10000000-0000-4000-8000-000000000001";
const habitId = "20000000-0000-4000-8000-000000000001";
const logId = "30000000-0000-4000-8000-000000000001";
const actor = { userId };
const now = new Date("2026-07-21T12:00:00.000Z");
const transaction = { execute: vi.fn() } as unknown as DatabaseTransaction;
const database = {
  transaction: vi.fn(async (work: (executor: DatabaseTransaction) => Promise<unknown>) => work(transaction)),
} as unknown as Database;
const clock: Clock = { now: vi.fn(() => now) };

function storedHabit(overrides: Record<string, unknown> = {}) {
  return {
    id: habitId,
    userId,
    title: "Morning reset",
    icon: "☀️",
    colorToken: "amber",
    goalKind: "boolean",
    targetValue: null,
    unit: null,
    version: 2,
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
    timezone: "UTC",
    startDate: "2026-07-01",
    endDate: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function storedLog(localDate: string, overrides: Record<string, unknown> = {}) {
  return {
    id: logId,
    userId,
    habitId,
    localDate,
    state: "completed",
    quantity: null,
    note: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("habit projection application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositories.habits.findById.mockResolvedValue(storedHabit());
    repositories.habits.findPageAnchor.mockResolvedValue(null);
    repositories.habits.listPageByLifecycle.mockResolvedValue([storedHabit()]);
    repositories.schedules.findByHabitId.mockResolvedValue(storedSchedule());
    repositories.schedules.listDistinctActiveTimezones.mockResolvedValue(["UTC"]);
    repositories.schedules.listForHabitIds.mockResolvedValue([storedSchedule()]);
    repositories.logs.listProjectionPage.mockResolvedValue([]);
    repositories.logs.listRangeByHabit.mockResolvedValue([]);
  });

  it("builds Today in one repeatable-read actor-scoped snapshot with strict output", async () => {
    const projection = await createHabitProjectionApplication({ database, clock }).getHabitToday(actor);
    const { rows } = projection;

    expect(rows).toHaveLength(1);
    expect(projection.boundaries).toEqual([{ timezone: "UTC", localDate: "2026-07-21" }]);
    expect(projection.nextCursor).toBeNull();
    expect(rows[0]).toMatchObject({
      detail: { habit: { id: habitId } },
      localDate: "2026-07-21",
      day: { localDate: "2026-07-21", status: "open", successful: false },
      requiresAction: true,
    });
    expect(rows[0]?.sevenDay).toHaveLength(7);
    expect(rows[0]?.sevenDay[0]).toMatchObject({ localDate: "2026-07-15" });
    expect(rows[0]).not.toHaveProperty("today");
    expect(rows[0]).not.toHaveProperty("userId");
    expect(database.transaction).toHaveBeenCalledWith(expect.anything(), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
    expect(repositories.habits.listPageByLifecycle).toHaveBeenCalledWith(
      userId,
      "active",
      { limit: 51 },
      transaction,
    );
    expect(repositories.schedules.listForHabitIds).toHaveBeenCalledWith(userId, [habitId], transaction);
    expect(repositories.logs.listProjectionPage).toHaveBeenCalledWith(
      userId,
      [habitId],
      undefined,
      transaction,
    );
    expect(repositories.schedules.listDistinctActiveTimezones).toHaveBeenCalledWith(userId, transaction);
    expect(repositories.habits.listPageByLifecycle.mock.invocationCallOrder[0]).toBeLessThan(
      repositories.schedules.listForHabitIds.mock.invocationCallOrder[0]!,
    );
    expect(repositories.schedules.listForHabitIds.mock.invocationCallOrder[0]).toBeLessThan(
      repositories.logs.listProjectionPage.mock.invocationCallOrder[0]!,
    );
  });

  it("returns sorted deduplicated local-date boundaries for every active timezone", async () => {
    const singaporeHabitId = "20000000-0000-4000-8000-000000000002";
    const losAngelesHabitId = "20000000-0000-4000-8000-000000000003";
    const duplicateUtcHabitId = "20000000-0000-4000-8000-000000000004";
    repositories.habits.listPageByLifecycle.mockResolvedValue([
      storedHabit(),
      storedHabit({ id: singaporeHabitId }),
      storedHabit({ id: losAngelesHabitId }),
      storedHabit({ id: duplicateUtcHabitId }),
    ]);
    repositories.schedules.listForHabitIds.mockResolvedValue([
      storedSchedule(),
      storedSchedule({
        habitId: singaporeHabitId,
        kind: "weekdays",
        weekdays: [1],
        timezone: "Asia/Singapore",
      }),
      storedSchedule({ habitId: losAngelesHabitId, timezone: "America/Los_Angeles" }),
      storedSchedule({ habitId: duplicateUtcHabitId, startDate: "2026-07-22" }),
    ]);
    repositories.schedules.listDistinctActiveTimezones.mockResolvedValue([
      "America/Los_Angeles",
      "Asia/Singapore",
      "UTC",
    ]);
    const boundaryClock: Clock = { now: () => new Date("2026-07-21T00:30:00.000Z") };

    const projection = await createHabitProjectionApplication({
      database,
      clock: boundaryClock,
    }).getHabitToday(actor);

    expect(projection.rows.map(({ detail }) => detail.habit.id)).toEqual([habitId, losAngelesHabitId]);
    expect(projection.boundaries).toEqual([
      { timezone: "America/Los_Angeles", localDate: "2026-07-20" },
      { timezone: "Asia/Singapore", localDate: "2026-07-21" },
      { timezone: "UTC", localDate: "2026-07-21" },
    ]);
  });

  it("stops presenting weekly-target work after the current week reaches its derived target", async () => {
    const schedule = storedSchedule({
      kind: "weekly_target",
      weekdays: null,
      targetPerWeek: 2,
    });
    const logs = [
      storedLog("2026-07-20"),
      storedLog("2026-07-21", { id: "30000000-0000-4000-8000-000000000002" }),
    ];
    repositories.schedules.listForHabitIds.mockResolvedValue([schedule]);
    repositories.logs.listProjectionPage.mockResolvedValue(logs);

    const { rows } = await createHabitProjectionApplication({ database, clock }).getHabitToday(actor);
    const [row] = rows;

    expect(row).toMatchObject({
      day: { status: "successful" },
      weeklyProgress: { completedDays: 2, targetPerWeek: 2, achieved: true, open: true },
      requiresAction: false,
    });
  });

  it("derives bounded history states and maps logs without exposing persistence ownership", async () => {
    repositories.logs.listRangeByHabit.mockResolvedValue([
      storedLog("2026-07-19", { state: "skipped" }),
      storedLog("2026-07-20", { id: "30000000-0000-4000-8000-000000000002" }),
    ]);

    const history = await createHabitProjectionApplication({ database, clock }).getHabitHistory(
      actor,
      habitId,
      { startDate: "2026-07-19", endDate: "2026-07-22" },
    );

    expect(history.days.map(({ localDate, status }) => ({ localDate, status }))).toEqual([
      { localDate: "2026-07-19", status: "skipped" },
      { localDate: "2026-07-20", status: "successful" },
      { localDate: "2026-07-21", status: "open" },
      { localDate: "2026-07-22", status: "future" },
    ]);
    expect(history.days[0]?.log).not.toHaveProperty("userId");
    expect(repositories.habits.findById).toHaveBeenCalledWith(userId, habitId, transaction);
    expect(repositories.schedules.findByHabitId).toHaveBeenCalledWith(userId, habitId, transaction);
    expect(repositories.logs.listRangeByHabit).toHaveBeenCalledWith(
      userId,
      habitId,
      { startDate: "2026-07-19", endDate: "2026-07-22" },
      transaction,
    );
  });

  it("derives streak and complete calendar-month data without persisted counters", async () => {
    repositories.logs.listProjectionPage.mockResolvedValue([
      storedLog("2026-07-19"),
      storedLog("2026-07-20", { id: "30000000-0000-4000-8000-000000000002" }),
    ]);
    repositories.logs.listRangeByHabit.mockResolvedValue([
      storedLog("2026-07-19"),
      storedLog("2026-07-20", { id: "30000000-0000-4000-8000-000000000002" }),
    ]);
    const application = createHabitProjectionApplication({ database, clock });

    await expect(application.getHabitStreaks(actor, habitId)).resolves.toMatchObject({
      habitId,
      cadence: "day",
      current: 2,
      best: 2,
      evaluatedThrough: "2026-07-21",
    });
    const month = await application.getHabitMonth(actor, habitId, { yearMonth: "2026-07" });
    expect(month.days).toHaveLength(31);
    expect(month.days.find(({ localDate }) => localDate === "2026-07-20")).toMatchObject({
      status: "successful",
    });
    expect(month).not.toHaveProperty("recordedDays");
    expect(repositories.logs.listProjectionPage).toHaveBeenCalledWith(
      userId,
      [habitId],
      undefined,
      transaction,
    );
    expect(repositories.logs.listRangeByHabit).toHaveBeenCalledWith(
      userId,
      habitId,
      { startDate: "2026-07-01", endDate: "2026-07-31" },
      transaction,
    );
  });

  it("omits out-of-range rows while retaining their active timezone boundary", async () => {
    repositories.schedules.listForHabitIds.mockResolvedValue([storedSchedule({ startDate: "2026-07-22" })]);

    await expect(createHabitProjectionApplication({ database, clock }).getHabitToday(actor)).resolves.toEqual(
      { rows: [], boundaries: [{ timezone: "UTC", localDate: "2026-07-21" }], nextCursor: null },
    );
  });
});
