import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createHabitsApplication,
  type CreateHabitRequest,
  type HabitDetailDto,
  type HabitGoal,
  type HabitScheduleValue,
} from "../../modules/habits/index.ts";
import type { AuthenticatedActor } from "../../shared/auth/actor.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";
import type { Clock } from "../../shared/time/clock.ts";

import { createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("p3_habit_application");
let testInstant = new Date("2026-07-21T12:00:00.000Z");
const clock: Clock = { now: () => new Date(testInstant) };

let pool: Pool;
let database: Database;
let application: ReturnType<typeof createHabitsApplication>;
let owner: AuthenticatedActor;
let stranger: AuthenticatedActor;

describe("P3 habit application PostgreSQL integration", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema });
    application = createHabitsApplication({ database, clock });
  }, 60_000);

  beforeEach(async () => {
    testInstant = new Date("2026-07-21T12:00:00.000Z");
    owner = { userId: await insertUser(pool, "p3-habit-application-owner") };
    stranger = { userId: await insertUser(pool, "p3-habit-application-stranger") };
  });

  afterAll(async () => fixture.teardown());

  it("atomically creates every schedule kind and keeps definition mutations actor-scoped", async () => {
    const daily = await createHabit(owner, {
      title: "Morning reset",
      icon: "☀️",
      colorToken: "amber",
      goal: booleanGoal,
      schedule: dailySchedule("UTC", "2026-07-01"),
    });
    const weekdays = await createHabit(owner, {
      title: "Read on weekdays",
      icon: "📚",
      colorToken: "sky",
      goal: quantityGoal(20, "pages"),
      schedule: weekdaysSchedule([1, 3, 5], "America/Los_Angeles", "2026-07-01"),
    });
    const weekly = await createHabit(owner, {
      title: "Move three times",
      icon: "🏃",
      colorToken: "mint",
      goal: booleanGoal,
      schedule: weeklyTargetSchedule(3, "Asia/Singapore", "2025-12-29"),
    });

    expect([daily, weekdays, weekly].map(({ detail }) => detail.schedule.schedule.kind)).toEqual([
      "daily",
      "weekdays",
      "weekly_target",
    ]);
    await expect(countHabitGraph(owner.userId, daily.id)).resolves.toEqual({ habits: 1, schedules: 1 });
    const todaySource = await application.projections.getHabitToday(owner);
    expect(todaySource.boundaries).toEqual([
      { timezone: "America/Los_Angeles", localDate: "2026-07-21" },
      { timezone: "Asia/Singapore", localDate: "2026-07-21" },
      { timezone: "UTC", localDate: "2026-07-21" },
    ]);
    expect(todaySource.rows.map(({ detail }) => detail.habit.id).sort()).toEqual(
      [daily.id, weekly.id].sort(),
    );
    expect(todaySource.rows.some(({ detail }) => detail.habit.id === weekdays.id)).toBe(false);

    await expect(application.definitions.createHabit(owner, daily.id, daily.input)).resolves.toMatchObject({
      created: false,
      value: { habit: { id: daily.id, version: 1 } },
    });
    await expect(
      application.definitions.createHabit(owner, daily.id, {
        ...daily.input,
        title: "Conflicting replay",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 1 });

    const invalidId = randomUUID();
    await expect(
      application.definitions.createHabit(owner, invalidId, {
        ...daily.input,
        schedule: dailySchedule("Mars/Olympus", "2026-07-01"),
      }),
    ).rejects.toBeDefined();
    await expect(countHabitGraph(owner.userId, invalidId)).resolves.toEqual({ habits: 0, schedules: 0 });

    await expect(application.definitions.getHabit(stranger, daily.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      application.definitions.updateHabit(stranger, weekdays.id, {
        expectedVersion: 1,
        patch: { title: "Guessed title" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      application.schedules.setHabitSchedule(stranger, weekdays.id, {
        expectedVersion: 1,
        schedule: dailySchedule("UTC", "2026-07-01"),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      application.logs.recordHabitDay(stranger, weekdays.id, randomUUID(), {
        localDate: "2026-07-20",
        value: { state: "completed", quantity: 20, note: null },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      application.projections.getHabitHistory(stranger, weekdays.id, {
        startDate: "2026-07-20",
        endDate: "2026-07-21",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const updated = await application.definitions.updateHabit(owner, daily.id, {
      expectedVersion: 1,
      patch: { title: "Morning reset ritual" },
    });
    expect(updated.habit).toMatchObject({ version: 2, title: "Morning reset ritual" });
    await expect(
      application.definitions.updateHabit(owner, daily.id, {
        expectedVersion: 1,
        patch: { icon: "🌤️" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 2 });
    await expect(
      application.schedules.setHabitSchedule(owner, daily.id, {
        expectedVersion: 1,
        schedule: weekdaysSchedule([2, 4], "UTC", "2026-07-01"),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 2 });
    await expect(
      application.schedules.setHabitSchedule(owner, daily.id, {
        expectedVersion: 2,
        schedule: weekdaysSchedule([2, 4], "UTC", "2026-07-01"),
      }),
    ).resolves.toMatchObject({
      habit: { version: 3 },
      schedule: { schedule: { kind: "weekdays", weekdays: [2, 4] } },
    });

    const sameTenantKey = await application.definitions.createHabit(stranger, daily.id, {
      ...daily.input,
      title: "Stranger-owned same UUID",
    });
    expect(sameTenantKey).toMatchObject({ created: true, value: { habit: { id: daily.id } } });
    await expect(application.definitions.getHabit(owner, daily.id)).resolves.toMatchObject({
      habit: { title: "Morning reset ritual" },
    });
    await expect(application.definitions.getHabit(stranger, daily.id)).resolves.toMatchObject({
      habit: { title: "Stranger-owned same UUID" },
    });
  });

  it("denies every actor-addressable habit read and mutation without leaking owner content", async () => {
    const habit = await createHabit(owner, {
      title: "Private routine",
      icon: "🔒",
      colorToken: "slate",
      goal: booleanGoal,
      schedule: dailySchedule("UTC", "2026-07-01"),
    });
    const log = await application.logs.recordHabitDay(owner, habit.id, randomUUID(), {
      localDate: "2026-07-20",
      value: { state: "completed", quantity: null, note: "Owner-only note" },
    });

    const deniedAttempts: Array<() => Promise<unknown>> = [
      () => application.definitions.getHabit(stranger, habit.id),
      () =>
        application.definitions.updateHabit(stranger, habit.id, {
          expectedVersion: 1,
          patch: { title: "Guessed" },
        }),
      () => application.definitions.archiveHabit(stranger, habit.id, { expectedVersion: 1 }),
      () =>
        application.schedules.setHabitSchedule(stranger, habit.id, {
          expectedVersion: 1,
          schedule: dailySchedule("UTC", "2026-07-01"),
        }),
      () =>
        application.logs.recordHabitDay(stranger, habit.id, randomUUID(), {
          localDate: "2026-07-21",
          value: { state: "completed", quantity: null, note: null },
        }),
      () =>
        application.logs.editHabitDay(stranger, habit.id, "2026-07-20", {
          expectedVersion: log.log.version,
          value: { state: "completed", quantity: null, note: null },
        }),
      () =>
        application.logs.undoHabitDay(stranger, habit.id, "2026-07-20", {
          expectedVersion: log.log.version,
        }),
      () =>
        application.projections.getHabitHistory(stranger, habit.id, {
          startDate: "2026-07-20",
          endDate: "2026-07-21",
        }),
      () => application.projections.getHabitMonth(stranger, habit.id, { yearMonth: "2026-07" }),
      () => application.projections.getHabitOverview(stranger, habit.id),
      () => application.projections.getHabitStreaks(stranger, habit.id),
    ];
    for (const attempt of deniedAttempts) {
      await expect(attempt()).rejects.toMatchObject({ code: "NOT_FOUND" });
    }

    await expect(application.definitions.listHabits(stranger, { lifecycle: "active" })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    await expect(application.projections.getHabitToday(stranger)).resolves.toEqual({
      rows: [],
      boundaries: [],
      nextCursor: null,
    });
    await expect(
      application.projections.listHabitOverviews(stranger, { lifecycle: "active" }),
    ).resolves.toEqual({ items: [], nextCursor: null });

    const archived = await application.definitions.archiveHabit(owner, habit.id, { expectedVersion: 1 });
    await expect(
      application.definitions.restoreHabit(stranger, habit.id, {
        expectedVersion: archived.habit.version,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(application.definitions.listHabits(stranger, { lifecycle: "archived" })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    await expect(
      application.projections.listHabitOverviews(stranger, { lifecycle: "archived" }),
    ).resolves.toEqual({ items: [], nextCursor: null });
  });

  it("persists boolean and quantity day transitions with optimistic edit and undo semantics", async () => {
    const booleanHabit = await createHabit(owner, {
      title: "Journal",
      icon: "✍️",
      colorToken: "violet",
      goal: booleanGoal,
      schedule: dailySchedule("UTC", "2026-07-01"),
    });
    const quantityHabit = await createHabit(owner, {
      title: "Hydrate",
      icon: "💧",
      colorToken: "sky",
      goal: quantityGoal(3, "litres"),
      schedule: dailySchedule("UTC", "2026-07-01"),
    });

    const booleanLogId = randomUUID();
    const completed = await application.logs.recordHabitDay(owner, booleanHabit.id, booleanLogId, {
      localDate: "2026-07-18",
      value: { state: "completed", quantity: null, note: "Written" },
    });
    expect(completed).toMatchObject({
      outcome: "created",
      log: { state: "completed", successful: true, version: 1 },
    });
    const skipped = await application.logs.editHabitDay(owner, booleanHabit.id, "2026-07-18", {
      expectedVersion: 1,
      value: { state: "skipped", quantity: null, note: "Travel day" },
    });
    expect(skipped).toMatchObject({ state: "skipped", successful: false, version: 2 });
    const unachieved = await application.logs.editHabitDay(owner, booleanHabit.id, "2026-07-18", {
      expectedVersion: 2,
      value: { state: "unachieved", quantity: null, note: "Missed" },
    });
    expect(unachieved).toMatchObject({ state: "unachieved", successful: false, version: 3 });
    const restoredCompletion = await application.logs.editHabitDay(owner, booleanHabit.id, "2026-07-18", {
      expectedVersion: 3,
      value: { state: "completed", quantity: null, note: "Recovered" },
    });
    expect(restoredCompletion).toMatchObject({ state: "completed", successful: true, version: 4 });
    await expect(
      application.logs.undoHabitDay(owner, booleanHabit.id, "2026-07-18", { expectedVersion: 4 }),
    ).resolves.toMatchObject({ id: booleanLogId, version: 4 });
    await expect(countHabitLogs(owner.userId, booleanHabit.id, "2026-07-18")).resolves.toBe(0);

    const quantityLogId = randomUUID();
    const partial = await application.logs.recordHabitDay(owner, quantityHabit.id, quantityLogId, {
      localDate: "2026-07-19",
      value: { state: "completed", quantity: 2.5, note: "Below target" },
    });
    expect(partial.log).toMatchObject({ quantity: 2.5, successful: false, version: 1 });
    const successful = await application.logs.editHabitDay(owner, quantityHabit.id, "2026-07-19", {
      expectedVersion: 1,
      value: { state: "completed", quantity: 3.25, note: "Reached target" },
    });
    expect(successful).toMatchObject({ quantity: 3.25, successful: true, version: 2 });
    await expect(
      application.logs.editHabitDay(owner, quantityHabit.id, "2026-07-19", {
        expectedVersion: 1,
        value: { state: "completed", quantity: 4, note: null },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 2 });
    await expect(
      application.logs.undoHabitDay(owner, quantityHabit.id, "2026-07-19", { expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 2 });
    await application.logs.undoHabitDay(owner, quantityHabit.id, "2026-07-19", { expectedVersion: 2 });

    await application.logs.recordHabitDay(owner, quantityHabit.id, randomUUID(), {
      localDate: "2026-07-20",
      value: { state: "skipped", quantity: null, note: "Rest day" },
    });
    await application.logs.recordHabitDay(owner, quantityHabit.id, randomUUID(), {
      localDate: "2026-07-21",
      value: { state: "unachieved", quantity: null, note: "Below plan" },
    });
    const history = await application.projections.getHabitHistory(owner, quantityHabit.id, {
      startDate: "2026-07-19",
      endDate: "2026-07-21",
    });
    expect(history.days.map(({ localDate, status }) => ({ localDate, status }))).toEqual([
      { localDate: "2026-07-19", status: "open" },
      { localDate: "2026-07-20", status: "skipped" },
      { localDate: "2026-07-21", status: "unachieved" },
    ]);
  });

  it("preserves historical log facts across goal-kind edits and validates later edits against the current goal", async () => {
    const quantityHabit = await createHabit(owner, {
      title: "Read a little",
      icon: "📖",
      colorToken: "sky",
      goal: quantityGoal(5, "pages"),
      schedule: dailySchedule("UTC", "2026-07-01"),
    });
    const quantityLog = await application.logs.recordHabitDay(owner, quantityHabit.id, randomUUID(), {
      localDate: "2026-07-20",
      value: { state: "completed", quantity: 2, note: "Original fact" },
    });
    await application.definitions.updateHabit(owner, quantityHabit.id, {
      expectedVersion: 1,
      patch: { goal: booleanGoal },
    });
    const asBoolean = await application.projections.getHabitHistory(owner, quantityHabit.id, {
      startDate: "2026-07-20",
      endDate: "2026-07-20",
    });
    expect(asBoolean.days[0]).toMatchObject({
      status: "successful",
      successful: true,
      log: { quantity: 2, successful: true, version: quantityLog.log.version },
    });
    await expect(
      application.logs.editHabitDay(owner, quantityHabit.id, "2026-07-20", {
        expectedVersion: quantityLog.log.version,
        value: { state: "completed", quantity: 2, note: "Still numeric" },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      application.logs.editHabitDay(owner, quantityHabit.id, "2026-07-20", {
        expectedVersion: quantityLog.log.version,
        value: { state: "completed", quantity: null, note: "Reshaped for boolean" },
      }),
    ).resolves.toMatchObject({ quantity: null, successful: true, version: 2 });

    const booleanHabit = await createHabit(owner, {
      title: "Stretch",
      icon: "🧘",
      colorToken: "mint",
      goal: booleanGoal,
      schedule: dailySchedule("UTC", "2026-07-01"),
    });
    const booleanLog = await application.logs.recordHabitDay(owner, booleanHabit.id, randomUUID(), {
      localDate: "2026-07-20",
      value: { state: "completed", quantity: null, note: "Original fact" },
    });
    await application.definitions.updateHabit(owner, booleanHabit.id, {
      expectedVersion: 1,
      patch: { goal: quantityGoal(5, "minutes") },
    });
    const asQuantity = await application.projections.getHabitHistory(owner, booleanHabit.id, {
      startDate: "2026-07-20",
      endDate: "2026-07-20",
    });
    expect(asQuantity.days[0]).toMatchObject({
      status: "partial",
      successful: false,
      log: { quantity: null, successful: false, version: booleanLog.log.version },
    });
    await expect(
      application.logs.editHabitDay(owner, booleanHabit.id, "2026-07-20", {
        expectedVersion: booleanLog.log.version,
        value: { state: "completed", quantity: null, note: "Still boolean" },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      application.logs.editHabitDay(owner, booleanHabit.id, "2026-07-20", {
        expectedVersion: booleanLog.log.version,
        value: { state: "completed", quantity: 5, note: "Reshaped for quantity" },
      }),
    ).resolves.toMatchObject({ quantity: 5, successful: true, version: 2 });
  });

  it("serializes same-day writers into exact replay or existence-safe conflict", async () => {
    const habit = await createHabit(owner, {
      title: "Practice scales",
      icon: "🎹",
      colorToken: "coral",
      goal: quantityGoal(20, "minutes"),
      schedule: dailySchedule("UTC", "2026-07-01"),
    });
    const replayId = randomUUID();
    const replayInput = {
      localDate: "2026-07-20",
      value: { state: "completed" as const, quantity: 20, note: "Session" },
    };

    const replayResults = await Promise.all([
      application.logs.recordHabitDay(owner, habit.id, replayId, replayInput),
      application.logs.recordHabitDay(owner, habit.id, replayId, replayInput),
    ]);
    expect(replayResults.map(({ outcome }) => outcome).sort()).toEqual(["created", "idempotent_retry"]);
    await expect(countHabitLogs(owner.userId, habit.id, "2026-07-20")).resolves.toBe(1);

    const contenders = [
      {
        id: randomUUID(),
        input: {
          localDate: "2026-07-21",
          value: { state: "completed" as const, quantity: 20, note: "Reached" },
        },
      },
      {
        id: randomUUID(),
        input: {
          localDate: "2026-07-21",
          value: { state: "completed" as const, quantity: 10, note: "Partial" },
        },
      },
    ] as const;
    const settled = await Promise.allSettled(
      contenders.map(({ id, input }) => application.logs.recordHabitDay(owner, habit.id, id, input)),
    );
    const accepted = settled.filter((result) => result.status === "fulfilled");
    const rejected = settled.filter((result) => result.status === "rejected");
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      status: "rejected",
      reason: { code: "CONFLICT", currentVersion: 1 },
    });
    await expect(countHabitLogs(owner.userId, habit.id, "2026-07-21")).resolves.toBe(1);

    const winner = accepted[0];
    if (!winner || winner.status !== "fulfilled") throw new Error("A same-day writer must win.");
    const winningInput = contenders.find(({ id }) => id === winner.value.log.id);
    if (!winningInput) throw new Error("The accepted log must match one submitted resource ID.");
    await expect(
      application.logs.recordHabitDay(owner, habit.id, winningInput.id, winningInput.input),
    ).resolves.toMatchObject({ outcome: "idempotent_retry", log: { id: winningInput.id } });
    const loser = contenders.find(({ id }) => id !== winningInput.id);
    if (!loser) throw new Error("The concurrent conflict must retain one losing command.");
    await expect(
      application.logs.recordHabitDay(owner, habit.id, loser.id, winningInput.input),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 1 });
  });

  it("archives and restores Today visibility without losing canonical logs or projections", async () => {
    const habit = await createHabit(owner, {
      title: "Evening reflection",
      icon: "🌙",
      colorToken: "slate",
      goal: booleanGoal,
      schedule: dailySchedule("UTC", "2026-07-15"),
    });
    for (const localDate of ["2026-07-18", "2026-07-19", "2026-07-20"]) {
      await application.logs.recordHabitDay(owner, habit.id, randomUUID(), {
        localDate,
        value: { state: "completed", quantity: null, note: null },
      });
    }

    const today = findTodayRow(await application.projections.getHabitToday(owner), habit.id);
    expect(today).toMatchObject({
      localDate: "2026-07-21",
      day: { localDate: "2026-07-21", status: "open" },
      streak: { cadence: "day", current: 3, best: 3 },
      requiresAction: true,
    });
    expect(today.sevenDay.map(({ localDate }) => localDate)).toEqual([
      "2026-07-15",
      "2026-07-16",
      "2026-07-17",
      "2026-07-18",
      "2026-07-19",
      "2026-07-20",
      "2026-07-21",
    ]);
    const monthBefore = await application.projections.getHabitMonth(owner, habit.id, {
      yearMonth: "2026-07",
    });
    expect(monthBefore.days).toHaveLength(31);
    expect(monthBefore.days.find(({ localDate }) => localDate === "2026-07-20")).toMatchObject({
      status: "successful",
    });

    const archived = await application.definitions.archiveHabit(owner, habit.id, { expectedVersion: 1 });
    expect(archived.habit).toMatchObject({ version: 2, archivedAt: testInstant.toISOString() });
    expect(findOptionalTodayRow(await application.projections.getHabitToday(owner), habit.id)).toBeNull();
    await expect(
      application.projections.listHabitOverviews(owner, { lifecycle: "archived" }),
    ).resolves.toEqual({
      items: expect.arrayContaining([
        expect.objectContaining({
          detail: expect.objectContaining({
            habit: expect.objectContaining({ id: habit.id }),
          }),
        }),
      ]),
      nextCursor: null,
    });
    await expect(
      application.logs.recordHabitDay(owner, habit.id, randomUUID(), {
        localDate: "2026-07-21",
        value: { state: "completed", quantity: null, note: null },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 2 });

    const archivedHistory = await application.projections.getHabitHistory(owner, habit.id, {
      startDate: "2026-07-18",
      endDate: "2026-07-21",
    });
    expect(archivedHistory.days.map(({ status }) => status)).toEqual([
      "successful",
      "successful",
      "successful",
      "open",
    ]);
    await expect(
      application.definitions.restoreHabit(owner, habit.id, { expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 2 });
    const restored = await application.definitions.restoreHabit(owner, habit.id, { expectedVersion: 2 });
    expect(restored).toMatchObject({
      habit: { version: 3, archivedAt: null },
      schedule: { schedule: { kind: "daily", startDate: "2026-07-15" } },
    });
    expect(findTodayRow(await application.projections.getHabitToday(owner), habit.id)).toMatchObject({
      streak: { current: 3, best: 3 },
      requiresAction: true,
    });
    await expect(
      application.projections.getHabitHistory(owner, habit.id, {
        startDate: "2026-07-18",
        endDate: "2026-07-21",
      }),
    ).resolves.toEqual(archivedHistory);
  });

  it("derives weekly-target progress across ISO-year boundaries and closes only after Sunday", async () => {
    testInstant = new Date("2026-01-18T12:00:00.000Z");
    const habit = await createHabit(owner, {
      title: "Move three days",
      icon: "🏃",
      colorToken: "mint",
      goal: booleanGoal,
      schedule: weeklyTargetSchedule(3, "UTC", "2025-12-29"),
    });
    for (const localDate of [
      "2025-12-29",
      "2026-01-01",
      "2026-01-04",
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
      "2026-01-12",
    ]) {
      await recordBooleanCompletion(habit.id, localDate);
    }
    await application.logs.recordHabitDay(owner, habit.id, randomUUID(), {
      localDate: "2026-01-13",
      value: { state: "skipped", quantity: null, note: null },
    });
    await application.logs.recordHabitDay(owner, habit.id, randomUUID(), {
      localDate: "2026-01-14",
      value: { state: "unachieved", quantity: null, note: null },
    });

    const openSunday = findTodayRow(await application.projections.getHabitToday(owner), habit.id);
    expect(openSunday).toMatchObject({
      localDate: "2026-01-18",
      day: { status: "open" },
      streak: { cadence: "week", current: 2, best: 2 },
      weeklyProgress: { completedDays: 1, targetPerWeek: 3, achieved: false, open: true },
      requiresAction: true,
    });
    expect(openSunday.sevenDay.map(({ localDate }) => localDate)).toEqual([
      "2026-01-12",
      "2026-01-13",
      "2026-01-14",
      "2026-01-15",
      "2026-01-16",
      "2026-01-17",
      "2026-01-18",
    ]);

    await recordBooleanCompletion(habit.id, "2026-01-16");
    const sundayLog = await application.logs.recordHabitDay(owner, habit.id, randomUUID(), {
      localDate: "2026-01-18",
      value: { state: "completed", quantity: null, note: "Target day" },
    });
    const achieved = findTodayRow(await application.projections.getHabitToday(owner), habit.id);
    expect(achieved).toMatchObject({
      day: { status: "successful" },
      streak: { current: 3, best: 3 },
      weeklyProgress: { completedDays: 3, achieved: true },
      requiresAction: false,
    });

    const edited = await application.logs.editHabitDay(owner, habit.id, "2026-01-18", {
      expectedVersion: sundayLog.log.version,
      value: { state: "skipped", quantity: null, note: "Reclassified" },
    });
    expect(edited).toMatchObject({ state: "skipped", version: 2 });
    await application.logs.undoHabitDay(owner, habit.id, "2026-01-18", {
      expectedVersion: edited.version,
    });
    expect(findTodayRow(await application.projections.getHabitToday(owner), habit.id)).toMatchObject({
      day: { status: "open" },
      weeklyProgress: { completedDays: 2, achieved: false },
      requiresAction: true,
    });

    testInstant = new Date("2026-01-19T12:00:00.000Z");
    await expect(application.projections.getHabitStreaks(owner, habit.id)).resolves.toMatchObject({
      cadence: "week",
      current: 0,
      best: 2,
      evaluatedThrough: "2026-01-19",
    });
    const january = await application.projections.getHabitMonth(owner, habit.id, {
      yearMonth: "2026-01",
    });
    expect(january.days).toHaveLength(31);
    expect(january.days.find(({ localDate }) => localDate === "2026-01-01")).toMatchObject({
      status: "successful",
    });
  });

  it("uses the stored New York timezone through the spring-forward local-day boundary", async () => {
    testInstant = new Date("2026-03-08T04:30:00.000Z");
    const habit = await createHabit(owner, {
      title: "DST morning habit",
      icon: "🌅",
      colorToken: "coral",
      goal: booleanGoal,
      schedule: dailySchedule("America/New_York", "2026-03-06"),
    });
    await recordBooleanCompletion(habit.id, "2026-03-06");
    await recordBooleanCompletion(habit.id, "2026-03-07");

    expect(findTodayRow(await application.projections.getHabitToday(owner), habit.id)).toMatchObject({
      localDate: "2026-03-07",
      day: { status: "successful" },
      streak: { current: 2, best: 2 },
      requiresAction: false,
    });

    testInstant = new Date("2026-03-08T07:30:00.000Z");
    const afterSpringForward = findTodayRow(await application.projections.getHabitToday(owner), habit.id);
    expect(afterSpringForward).toMatchObject({
      localDate: "2026-03-08",
      day: { status: "open" },
      streak: { current: 2, best: 2 },
      requiresAction: true,
    });
    expect(afterSpringForward.sevenDay.at(-1)).toMatchObject({ localDate: "2026-03-08" });

    await recordBooleanCompletion(habit.id, "2026-03-08");
    await expect(application.projections.getHabitStreaks(owner, habit.id)).resolves.toMatchObject({
      cadence: "day",
      current: 3,
      best: 3,
      evaluatedThrough: "2026-03-08",
    });
    const march = await application.projections.getHabitMonth(owner, habit.id, {
      yearMonth: "2026-03",
    });
    expect(march.days.find(({ localDate }) => localDate === "2026-03-08")).toMatchObject({
      status: "successful",
    });
  });
});

const booleanGoal = { goalKind: "boolean", targetValue: null, unit: null } as const;

function quantityGoal(targetValue: number, unit: string): HabitGoal {
  return { goalKind: "quantity", targetValue, unit };
}

function dailySchedule(timezone: string, startDate: string): HabitScheduleValue {
  return { kind: "daily", weekdays: null, targetPerWeek: null, timezone, startDate, endDate: null };
}

function weekdaysSchedule(
  weekdays: (1 | 2 | 3 | 4 | 5 | 6 | 7)[],
  timezone: string,
  startDate: string,
): HabitScheduleValue {
  return { kind: "weekdays", weekdays, targetPerWeek: null, timezone, startDate, endDate: null };
}

function weeklyTargetSchedule(
  targetPerWeek: number,
  timezone: string,
  startDate: string,
): HabitScheduleValue {
  return {
    kind: "weekly_target",
    weekdays: null,
    targetPerWeek,
    timezone,
    startDate,
    endDate: null,
  };
}

async function createHabit(
  actor: AuthenticatedActor,
  input: CreateHabitRequest,
  id = randomUUID(),
): Promise<{ id: string; input: CreateHabitRequest; detail: HabitDetailDto }> {
  const result = await application.definitions.createHabit(actor, id, input);
  expect(result.created).toBe(true);
  return { id, input, detail: result.value };
}

async function recordBooleanCompletion(habitId: string, localDate: string) {
  return application.logs.recordHabitDay(owner, habitId, randomUUID(), {
    localDate,
    value: { state: "completed", quantity: null, note: null },
  });
}

function findOptionalTodayRow(
  projection: Awaited<ReturnType<typeof application.projections.getHabitToday>>,
  habitId: string,
) {
  return projection.rows.find(({ detail }) => detail.habit.id === habitId) ?? null;
}

function findTodayRow(
  projection: Awaited<ReturnType<typeof application.projections.getHabitToday>>,
  habitId: string,
) {
  const row = findOptionalTodayRow(projection, habitId);
  if (!row) throw new Error(`Habit ${habitId} was expected in Today.`);
  return row;
}

async function countHabitGraph(userId: string, habitId: string) {
  const result = await pool.query<{ habits: number; schedules: number }>(
    `select
       (select count(*)::int from habits where user_id = $1 and id = $2) as habits,
       (select count(*)::int from habit_schedules where user_id = $1 and habit_id = $2) as schedules`,
    [userId, habitId],
  );
  return result.rows[0] ?? { habits: 0, schedules: 0 };
}

async function countHabitLogs(userId: string, habitId: string, localDate: string) {
  const result = await pool.query<{ count: number }>(
    `select count(*)::int as count
       from habit_logs
      where user_id = $1 and habit_id = $2 and local_date = $3`,
    [userId, habitId, localDate],
  );
  return result.rows[0]?.count ?? 0;
}
