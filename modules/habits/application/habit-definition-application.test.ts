import type { Database, DatabaseTransaction } from "@/shared/db/client";
import type { Clock } from "@/shared/time/clock";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repositories = vi.hoisted(() => ({
  habits: {
    findById: vi.fn(),
    findPageAnchor: vi.fn(),
    lockById: vi.fn(),
    listPageByLifecycle: vi.fn(),
    insert: vi.fn(),
    updateDefinition: vi.fn(),
    incrementVersion: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
  },
  schedules: {
    findByHabitId: vi.fn(),
    lockByHabitId: vi.fn(),
    listForHabitIds: vi.fn(),
    insert: vi.fn(),
    replace: vi.fn(),
  },
}));

vi.mock("../infrastructure/habit-repository", () => ({
  createHabitRepository: () => repositories.habits,
}));
vi.mock("../infrastructure/habit-schedule-repository", () => ({
  createHabitScheduleRepository: () => repositories.schedules,
}));

import { createHabitDefinitionApplication } from "./habit-definition-application";
import { encodeHabitPageCursor } from "./habit-page-cursor";
import type { HabitReadSnapshot } from "./habit-read-snapshot";
import { createHabitScheduleApplication } from "./habit-schedule-application";

const userId = "10000000-0000-4000-8000-000000000001";
const habitId = "20000000-0000-4000-8000-000000000001";
const actor = { userId };
const now = new Date("2026-07-21T01:02:03.000Z");
const transaction = { execute: vi.fn() } as unknown as DatabaseTransaction;
const database = {
  transaction: vi.fn(async (work: (executor: DatabaseTransaction) => Promise<unknown>) => work(transaction)),
} as unknown as Database;
const snapshot: HabitReadSnapshot = { run: vi.fn((work) => work(transaction)) };
const clock: Clock = { now: vi.fn(() => now) };

const createInput = {
  title: "Morning reset",
  icon: "☀️",
  colorToken: "amber",
  goal: { goalKind: "boolean", targetValue: null, unit: null },
  schedule: {
    kind: "daily",
    weekdays: null,
    targetPerWeek: null,
    timezone: "Asia/Singapore",
    startDate: "2026-07-21",
    endDate: null,
  },
} as const;

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
    version: 1,
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
    startDate: "2026-07-21",
    endDate: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("habit definition application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositories.habits.findById.mockResolvedValue(storedHabit());
    repositories.habits.lockById.mockResolvedValue(storedHabit());
    repositories.habits.findPageAnchor.mockResolvedValue(null);
    repositories.habits.listPageByLifecycle.mockResolvedValue([storedHabit()]);
    repositories.schedules.findByHabitId.mockResolvedValue(storedSchedule());
    repositories.schedules.lockByHabitId.mockResolvedValue(storedSchedule());
    repositories.schedules.listForHabitIds.mockResolvedValue([storedSchedule()]);
  });

  it("creates one definition and its required schedule atomically under the actor", async () => {
    repositories.habits.lockById.mockResolvedValueOnce(null);
    repositories.habits.insert.mockResolvedValue(storedHabit());
    repositories.schedules.insert.mockResolvedValue(storedSchedule());

    const result = await createHabitDefinitionApplication({ database, clock, snapshot }).createHabit(
      actor,
      habitId,
      createInput,
    );

    expect(result).toMatchObject({ created: true, value: { habit: { id: habitId, version: 1 } } });
    expect(database.transaction).toHaveBeenCalledOnce();
    expect(repositories.habits.insert).toHaveBeenCalledWith(
      {
        id: habitId,
        userId,
        definition: {
          title: "Morning reset",
          icon: "☀️",
          colorToken: "amber",
          goalKind: "boolean",
          targetValue: null,
          unit: null,
        },
        now,
      },
      transaction,
    );
    expect(repositories.schedules.insert).toHaveBeenCalledWith(
      expect.objectContaining({ userId, habitId, schedule: createInput.schedule, now }),
      transaction,
    );
    expect(repositories.habits.insert.mock.invocationCallOrder[0]).toBeLessThan(
      repositories.schedules.insert.mock.invocationCallOrder[0]!,
    );
  });

  it("replays the same resource id only for identical definition and schedule content", async () => {
    const application = createHabitDefinitionApplication({ database, clock, snapshot });

    await expect(application.createHabit(actor, habitId, createInput)).resolves.toMatchObject({
      created: false,
      value: { habit: { id: habitId } },
    });
    expect(repositories.habits.insert).not.toHaveBeenCalled();

    await expect(
      application.createHabit(actor, habitId, { ...createInput, title: "Different title" }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 1 });
    await expect(
      application.createHabit(actor, habitId, {
        ...createInput,
        schedule: { ...createInput.schedule, startDate: "2026-07-22" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 1 });
  });

  it("edits goal kind while incrementing the definition version exactly once", async () => {
    repositories.habits.updateDefinition.mockResolvedValue({
      outcome: "applied",
      habit: storedHabit({
        goalKind: "quantity",
        targetValue: 2.5,
        unit: "litres",
        version: 2,
      }),
    });

    const result = await createHabitDefinitionApplication({ database, clock, snapshot }).updateHabit(
      actor,
      habitId,
      {
        expectedVersion: 1,
        patch: { goal: { goalKind: "quantity", targetValue: 2.5, unit: "litres" } },
      },
    );

    expect(result.habit).toMatchObject({
      version: 2,
      goal: { goalKind: "quantity", targetValue: 2.5, unit: "litres" },
    });
    expect(repositories.habits.updateDefinition).toHaveBeenCalledOnce();
    expect(repositories.habits.updateDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        id: habitId,
        expectedVersion: 1,
        definition: expect.objectContaining({
          goalKind: "quantity",
          targetValue: 2.5,
          unit: "litres",
        }),
      }),
      transaction,
    );
    expect(repositories.schedules.replace).not.toHaveBeenCalled();
  });

  it("archives and restores without replacing the saved schedule", async () => {
    repositories.habits.archive.mockResolvedValue({
      outcome: "applied",
      habit: storedHabit({ version: 2, archivedAt: now }),
    });
    const definitions = createHabitDefinitionApplication({ database, clock, snapshot });

    await expect(definitions.archiveHabit(actor, habitId, { expectedVersion: 1 })).resolves.toMatchObject({
      habit: { version: 2, archivedAt: now.toISOString() },
    });
    expect(repositories.habits.archive).toHaveBeenCalledWith(
      { userId, id: habitId, expectedVersion: 1, now },
      transaction,
    );

    repositories.habits.lockById.mockResolvedValue(storedHabit({ version: 2, archivedAt: now }));
    repositories.habits.restore.mockResolvedValue({
      outcome: "applied",
      habit: storedHabit({ version: 3, archivedAt: null }),
    });
    await expect(definitions.restoreHabit(actor, habitId, { expectedVersion: 2 })).resolves.toMatchObject({
      habit: { version: 3, archivedAt: null },
    });
    expect(repositories.habits.restore).toHaveBeenCalledWith(
      { userId, id: habitId, expectedVersion: 2, now },
      transaction,
    );
    expect(repositories.schedules.replace).not.toHaveBeenCalled();
  });

  it("reads list data sequentially from one actor-scoped snapshot", async () => {
    const result = await createHabitDefinitionApplication({ database, clock, snapshot }).listHabits(actor, {
      lifecycle: "active",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).not.toHaveProperty("userId");
    expect(result.nextCursor).toBeNull();
    expect(snapshot.run).toHaveBeenCalledOnce();
    expect(repositories.habits.listPageByLifecycle).toHaveBeenCalledWith(
      userId,
      "active",
      { limit: 51 },
      transaction,
    );
    expect(repositories.schedules.listForHabitIds).toHaveBeenCalledWith(userId, [habitId], transaction);
    expect(repositories.habits.listPageByLifecycle.mock.invocationCallOrder[0]).toBeLessThan(
      repositories.schedules.listForHabitIds.mock.invocationCallOrder[0]!,
    );
  });

  it("validates an actor-scoped cursor anchor and returns deterministic continuation metadata", async () => {
    const secondId = "20000000-0000-4000-8000-000000000002";
    const cursor = encodeHabitPageCursor({
      version: 1,
      scope: "definitions",
      lifecycle: "active",
      updatedAt: now.toISOString(),
      id: habitId,
    });
    repositories.habits.findPageAnchor.mockResolvedValue({ id: habitId, updatedAt: now });
    repositories.habits.listPageByLifecycle.mockResolvedValue([
      storedHabit({ id: secondId }),
      storedHabit({ id: "20000000-0000-4000-8000-000000000003" }),
    ]);
    repositories.schedules.listForHabitIds.mockResolvedValue([storedSchedule({ habitId: secondId })]);

    const result = await createHabitDefinitionApplication({ database, clock, snapshot }).listHabits(actor, {
      lifecycle: "active",
      cursor,
      limit: 1,
    });

    expect(repositories.habits.findPageAnchor).toHaveBeenCalledWith(userId, "active", habitId, transaction);
    expect(repositories.habits.listPageByLifecycle).toHaveBeenCalledWith(
      userId,
      "active",
      { limit: 2, after: { id: habitId, updatedAt: now } },
      transaction,
    );
    expect(result.items.map(({ habit }) => habit.id)).toEqual([secondId]);
    expect(result.nextCursor).not.toBeNull();
  });

  it("rejects an expired cursor before querying its continuation", async () => {
    const cursor = encodeHabitPageCursor({
      version: 1,
      scope: "definitions",
      lifecycle: "active",
      updatedAt: now.toISOString(),
      id: habitId,
    });

    await expect(
      createHabitDefinitionApplication({ database, clock, snapshot }).listHabits(actor, {
        lifecycle: "active",
        cursor,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(repositories.habits.findPageAnchor).toHaveBeenCalledWith(userId, "active", habitId, transaction);
    expect(repositories.habits.listPageByLifecycle).not.toHaveBeenCalled();
  });
});

describe("habit schedule application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositories.habits.lockById.mockResolvedValue(storedHabit({ version: 4 }));
    repositories.schedules.lockByHabitId.mockResolvedValue(storedSchedule());
    repositories.schedules.replace.mockResolvedValue(
      storedSchedule({ kind: "weekdays", weekdays: [1, 3, 5], updatedAt: now }),
    );
    repositories.habits.incrementVersion.mockResolvedValue({
      outcome: "applied",
      habit: storedHabit({ version: 5 }),
    });
  });

  it("replaces the schedule before bumping the aggregate version exactly once", async () => {
    const result = await createHabitScheduleApplication({ database, clock }).setHabitSchedule(
      actor,
      habitId,
      {
        expectedVersion: 4,
        schedule: {
          kind: "weekdays",
          weekdays: [1, 3, 5],
          targetPerWeek: null,
          timezone: "Asia/Singapore",
          startDate: "2026-07-21",
          endDate: null,
        },
      },
    );

    expect(result).toMatchObject({
      habit: { version: 5 },
      schedule: { schedule: { kind: "weekdays", weekdays: [1, 3, 5] } },
    });
    expect(repositories.schedules.replace).toHaveBeenCalledOnce();
    expect(repositories.habits.incrementVersion).toHaveBeenCalledOnce();
    expect(repositories.schedules.replace.mock.invocationCallOrder[0]).toBeLessThan(
      repositories.habits.incrementVersion.mock.invocationCallOrder[0]!,
    );
    expect(repositories.habits.incrementVersion).toHaveBeenCalledWith(
      { userId, id: habitId, expectedVersion: 4, now },
      transaction,
    );
  });
});
