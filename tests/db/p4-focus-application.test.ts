import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTaskFocusLinkReader } from "../../modules/tasks/application/task-focus-link-reader.ts";
import { createHabitFocusLinkReader } from "../../modules/habits/application/habit-focus-link-reader.ts";
import {
  createFocusApplication,
  type FocusApplication,
  type FocusTimerSnapshot,
} from "../../modules/focus/index.ts";
import {
  createHabitFocusLinkValidator,
  createTaskFocusLinkValidator,
} from "../../modules/focus/application/focus-link-adapters.ts";
import type { AuthenticatedActor } from "../../shared/auth/actor.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";
import type { Clock } from "../../shared/time/clock.ts";

import { createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("p4_focus_application");
let testInstant = new Date("2026-07-21T08:00:00.000Z");
const clock: Clock = { now: () => new Date(testInstant) };
const timezones = new Map<string, string>();

let pool: Pool;
let database: Database;
let application: FocusApplication;
let owner: OwnerGraph;
let stranger: OwnerGraph;

describe("P4 Focus application PostgreSQL integration", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema });
    application = createFocusApplication({
      database,
      clock,
      links: {
        task: createTaskFocusLinkValidator(createTaskFocusLinkReader(database)),
        habit: createHabitFocusLinkValidator(createHabitFocusLinkReader(database)),
      },
      resolveUserTimezone: async (actor) => timezones.get(actor.userId) ?? "UTC",
    });
  }, 60_000);

  beforeEach(async () => {
    testInstant = new Date("2026-07-21T08:00:00.000Z");
    timezones.clear();
    owner = await createOwnerGraph("p4-focus-owner");
    stranger = await createOwnerGraph("p4-focus-stranger");
    timezones.set(owner.actor.userId, "UTC");
    timezones.set(stranger.actor.userId, "UTC");
  });

  afterAll(async () => fixture.teardown());

  it("reconstructs pause, refresh, resume, and finish from server time exactly once", async () => {
    const sessionId = randomUUID();
    const started = await application.startFocusSession(owner.actor, {
      id: sessionId,
      kind: "focus",
      mode: "pomodoro",
      plannedSeconds: 1_500,
      taskId: owner.taskId,
      habitId: null,
    });
    expect(started).toMatchObject({
      outcome: "created",
      snapshot: {
        authoritativeAt: "2026-07-21T08:00:00.000Z",
        elapsedActiveSeconds: 0,
        remainingSeconds: 1_500,
        link: {
          kind: "task",
          id: owner.taskId,
          label: "Focus task p4-focus-owner",
          availability: "available",
        },
        session: { id: sessionId, state: "active", version: 1 },
      },
    });

    testInstant = new Date("2026-07-21T08:01:30.900Z");
    const paused = await application.pauseFocusSession(owner.actor, sessionId, { expectedVersion: 1 });
    expect(paused).toMatchObject({
      elapsedActiveSeconds: 90,
      remainingSeconds: 1_410,
      session: {
        state: "paused",
        accumulatedActiveSeconds: 90,
        pausedAt: "2026-07-21T08:01:30.900Z",
        version: 2,
      },
    });
    await expect(
      application.pauseFocusSession(owner.actor, sessionId, { expectedVersion: 1 }),
    ).resolves.toEqual(paused);

    testInstant = new Date("2026-07-21T08:10:00.000Z");
    await expect(application.getActiveFocusSession(owner.actor)).resolves.toMatchObject({
      elapsedActiveSeconds: 90,
      session: { state: "paused", accumulatedActiveSeconds: 90, version: 2 },
    });

    const resumed = await application.resumeFocusSession(owner.actor, sessionId, { expectedVersion: 2 });
    expect(resumed).toMatchObject({
      elapsedActiveSeconds: 90,
      session: {
        state: "active",
        startedAt: "2026-07-21T08:10:00.000Z",
        pausedAt: null,
        accumulatedActiveSeconds: 90,
        version: 3,
      },
    });
    await expect(
      application.resumeFocusSession(owner.actor, sessionId, { expectedVersion: 2 }),
    ).resolves.toEqual(resumed);

    testInstant = new Date("2026-07-21T08:10:45.999Z");
    await expect(application.getActiveFocusSession(owner.actor)).resolves.toMatchObject({
      authoritativeAt: "2026-07-21T08:10:45.999Z",
      elapsedActiveSeconds: 135,
      session: { accumulatedActiveSeconds: 90, version: 3 },
    });
    const finished = await application.finishFocusSession(owner.actor, sessionId, { expectedVersion: 3 });
    expect(finished).toMatchObject({
      elapsedActiveSeconds: 135,
      session: {
        state: "completed",
        accumulatedActiveSeconds: 135,
        endedAt: "2026-07-21T08:10:45.999Z",
        version: 4,
      },
    });
    await expect(
      application.finishFocusSession(owner.actor, sessionId, { expectedVersion: 3 }),
    ).resolves.toEqual(finished);
    await expect(application.getActiveFocusSession(owner.actor)).resolves.toBeNull();
    await expect(application.listRecentFocusSessions(owner.actor)).resolves.toMatchObject({
      items: [{ session: { id: sessionId, accumulatedActiveSeconds: 135 } }],
      nextCursor: null,
    });
  });

  it("discards unfinished rows and corrects then deletes completed focus with optimistic retries", async () => {
    const discardedId = randomUUID();
    await application.startFocusSession(owner.actor, {
      id: discardedId,
      kind: "focus",
      mode: "stopwatch",
      plannedSeconds: null,
      taskId: null,
      habitId: null,
    });
    await expect(
      application.discardFocusSession(owner.actor, discardedId, { expectedVersion: 1 }),
    ).resolves.toMatchObject({ id: discardedId, state: "active", version: 1 });
    await expect(countSessions(owner.actor.userId, discardedId)).resolves.toBe(0);

    const completedId = randomUUID();
    testInstant = new Date("2026-07-21T09:00:00.000Z");
    await application.startFocusSession(owner.actor, {
      id: completedId,
      kind: "focus",
      mode: "stopwatch",
      plannedSeconds: null,
      taskId: owner.taskId,
      habitId: null,
    });
    testInstant = new Date("2026-07-21T09:10:00.000Z");
    await application.finishFocusSession(owner.actor, completedId, { expectedVersion: 1 });

    testInstant = new Date("2026-07-21T09:11:00.000Z");
    const correction = {
      expectedVersion: 2,
      patch: {
        durationSeconds: 777,
        link: { kind: "habit" as const, id: owner.habitId },
      },
    };
    const corrected = await application.correctCompletedSession(owner.actor, completedId, correction);
    expect(corrected).toMatchObject({
      id: completedId,
      accumulatedActiveSeconds: 777,
      taskId: null,
      habitId: owner.habitId,
      state: "completed",
      version: 3,
    });
    await expect(application.correctCompletedSession(owner.actor, completedId, correction)).resolves.toEqual(
      corrected,
    );
    await expect(application.getFocusSummary(owner.actor)).resolves.toMatchObject({
      todaySeconds: 777,
      sevenDaySeconds: 777,
    });
    await expect(application.listRecentFocusSessions(owner.actor)).resolves.toMatchObject({
      items: [
        {
          session: { id: completedId, accumulatedActiveSeconds: 777, version: 3 },
          link: {
            kind: "habit",
            id: owner.habitId,
            label: "Focus habit p4-focus-owner",
            availability: "available",
          },
        },
      ],
    });

    await expect(
      application.deleteCompletedSession(owner.actor, completedId, { expectedVersion: 3 }),
    ).resolves.toEqual(corrected);
    await expect(countSessions(owner.actor.userId, completedId)).resolves.toBe(0);
    await expect(application.getFocusSummary(owner.actor)).resolves.toMatchObject({
      todaySeconds: 0,
      sevenDaySeconds: 0,
    });
    await expect(application.listRecentFocusSessions(owner.actor)).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it("keeps completed breaks out of totals and history while counting stopwatch focus", async () => {
    const breakId = randomUUID();
    await application.startFocusSession(owner.actor, {
      id: breakId,
      kind: "break",
      mode: "pomodoro",
      plannedSeconds: 300,
      taskId: null,
      habitId: null,
    });
    testInstant = new Date("2026-07-21T08:05:00.000Z");
    const completedBreak = await application.finishFocusSession(owner.actor, breakId, {
      expectedVersion: 1,
    });
    expect(completedBreak).toMatchObject({
      elapsedActiveSeconds: 300,
      session: { kind: "break", state: "completed", accumulatedActiveSeconds: 300, version: 2 },
    });
    await expect(application.getFocusSummary(owner.actor)).resolves.toMatchObject({
      todaySeconds: 0,
      sevenDaySeconds: 0,
    });
    await expect(application.listRecentFocusSessions(owner.actor)).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    await expect(
      application.correctCompletedSession(owner.actor, breakId, {
        expectedVersion: 2,
        patch: { durationSeconds: 10 },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 2 });
    await expect(
      application.deleteCompletedSession(owner.actor, breakId, { expectedVersion: 2 }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 2 });

    const stopwatchId = randomUUID();
    testInstant = new Date("2026-07-21T08:10:00.000Z");
    await application.startFocusSession(owner.actor, {
      id: stopwatchId,
      kind: "focus",
      mode: "stopwatch",
      plannedSeconds: null,
      taskId: null,
      habitId: null,
    });
    testInstant = new Date("2026-07-21T08:10:42.900Z");
    await application.finishFocusSession(owner.actor, stopwatchId, { expectedVersion: 1 });
    await expect(application.getFocusSummary(owner.actor)).resolves.toMatchObject({
      todaySeconds: 42,
      sevenDaySeconds: 42,
    });
    const history = await application.listRecentFocusSessions(owner.actor);
    expect(history.items).toHaveLength(1);
    expect(history.items[0]).toMatchObject({
      session: { id: stopwatchId, kind: "focus", mode: "stopwatch", accumulatedActiveSeconds: 42 },
      link: null,
    });
  });

  it("serializes simultaneous starts and preserves actor-scoped idempotency and recovery", async () => {
    const replayId = randomUUID();
    const replayInput = {
      id: replayId,
      kind: "focus" as const,
      mode: "pomodoro" as const,
      plannedSeconds: 1_500,
      taskId: owner.taskId,
      habitId: null,
    };
    const replays = await Promise.all([
      application.startFocusSession(owner.actor, replayInput),
      application.startFocusSession(owner.actor, replayInput),
    ]);
    expect(replays.map(({ outcome }) => outcome).sort()).toEqual(["created", "idempotent_retry"]);
    expect(new Set(replays.map(({ snapshot }) => snapshot.session.id))).toEqual(new Set([replayId]));
    await expect(countUnfinished(owner.actor.userId)).resolves.toBe(1);

    const recovered = await application.startFocusSession(owner.actor, {
      id: randomUUID(),
      kind: "focus",
      mode: "stopwatch",
      plannedSeconds: null,
      taskId: stranger.taskId,
      habitId: null,
    });
    expect(recovered).toMatchObject({
      outcome: "recovered_existing",
      snapshot: { session: { id: replayId }, link: { id: owner.taskId } },
    });

    await expect(
      application.startFocusSession(stranger.actor, { ...replayInput, taskId: stranger.taskId }),
    ).resolves.toMatchObject({
      outcome: "created",
      snapshot: { session: { id: replayId } },
    });
    await expect(countSessions(owner.actor.userId, replayId)).resolves.toBe(1);
    await expect(countSessions(stranger.actor.userId, replayId)).resolves.toBe(1);

    await application.discardFocusSession(owner.actor, replayId, { expectedVersion: 1 });
    const contenders = [randomUUID(), randomUUID()] as const;
    const raced = await Promise.all(
      contenders.map((id) =>
        application.startFocusSession(owner.actor, {
          id,
          kind: "focus",
          mode: "stopwatch",
          plannedSeconds: null,
          taskId: null,
          habitId: null,
        }),
      ),
    );
    expect(raced.map(({ outcome }) => outcome).sort()).toEqual(["created", "recovered_existing"]);
    const winnerId = raced[0]?.snapshot.session.id;
    expect(winnerId).toBeDefined();
    expect(raced.every(({ snapshot }) => snapshot.session.id === winnerId)).toBe(true);
    await expect(countUnfinished(owner.actor.userId)).resolves.toBe(1);
    await expect(countSessions(owner.actor.userId, contenders[0])).resolves.toBe(
      contenders[0] === winnerId ? 1 : 0,
    );
    await expect(countSessions(owner.actor.userId, contenders[1])).resolves.toBe(
      contenders[1] === winnerId ? 1 : 0,
    );
  });

  it("denies cross-user links, reads, transitions, corrections, and deletion without existence leaks", async () => {
    for (const input of [
      {
        id: randomUUID(),
        kind: "focus" as const,
        mode: "pomodoro" as const,
        plannedSeconds: 1_500,
        taskId: stranger.taskId,
        habitId: null,
      },
      {
        id: randomUUID(),
        kind: "focus" as const,
        mode: "stopwatch" as const,
        plannedSeconds: null,
        taskId: null,
        habitId: stranger.habitId,
      },
      {
        id: randomUUID(),
        kind: "focus" as const,
        mode: "stopwatch" as const,
        plannedSeconds: null,
        taskId: randomUUID(),
        habitId: null,
      },
    ]) {
      await expect(application.startFocusSession(owner.actor, input)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
      });
    }
    await expect(countUnfinished(owner.actor.userId)).resolves.toBe(0);

    const sessionId = randomUUID();
    await application.startFocusSession(owner.actor, {
      id: sessionId,
      kind: "focus",
      mode: "pomodoro",
      plannedSeconds: 1_500,
      taskId: owner.taskId,
      habitId: null,
    });
    await expect(
      application.pauseFocusSession(stranger.actor, sessionId, { expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      application.discardFocusSession(stranger.actor, sessionId, { expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(application.getActiveFocusSession(stranger.actor)).resolves.toBeNull();
    await expect(application.listRecentFocusSessions(stranger.actor)).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    await expect(application.getFocusSummary(stranger.actor)).resolves.toMatchObject({
      todaySeconds: 0,
      sevenDaySeconds: 0,
    });

    testInstant = new Date("2026-07-21T08:01:00.000Z");
    const completed = await application.finishFocusSession(owner.actor, sessionId, { expectedVersion: 1 });
    await expect(
      application.correctCompletedSession(stranger.actor, sessionId, {
        expectedVersion: completed.session.version,
        patch: { durationSeconds: 1 },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      application.deleteCompletedSession(stranger.actor, sessionId, {
        expectedVersion: completed.session.version,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      application.correctCompletedSession(owner.actor, sessionId, {
        expectedVersion: completed.session.version,
        patch: { link: { kind: "habit", id: stranger.habitId } },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(readSession(owner.actor.userId, sessionId)).resolves.toMatchObject({
      version: completed.session.version,
      task_id: owner.taskId,
      habit_id: null,
    });

    const ownerLinks = await application.searchFocusLinks(owner.actor, { q: "Focus", limit: 20 });
    expect(ownerLinks.map(({ id }) => id).sort()).toEqual([owner.habitId, owner.taskId].sort());
    expect(ownerLinks.every(({ id }) => id !== stranger.taskId && id !== stranger.habitId)).toBe(true);
  });

  it("hydrates active and completed links safely after task deletion or habit archive", async () => {
    const taskSessionId = randomUUID();
    await application.startFocusSession(owner.actor, {
      id: taskSessionId,
      kind: "focus",
      mode: "stopwatch",
      plannedSeconds: null,
      taskId: owner.taskId,
      habitId: null,
    });
    await pool.query(`update tasks set deleted_at = $3 where user_id = $1 and id = $2`, [
      owner.actor.userId,
      owner.taskId,
      "2026-07-21T08:00:30.000Z",
    ]);
    await expect(application.getActiveFocusSession(owner.actor)).resolves.toMatchObject({
      session: { id: taskSessionId },
      link: { kind: "task", id: owner.taskId, label: null, availability: "unavailable" },
    });
    await expect(
      application.startFocusSession(owner.actor, {
        id: taskSessionId,
        kind: "focus",
        mode: "stopwatch",
        plannedSeconds: null,
        taskId: owner.taskId,
        habitId: null,
      }),
    ).resolves.toMatchObject({
      outcome: "idempotent_retry",
      snapshot: { link: { label: null, availability: "unavailable" } },
    });
    testInstant = new Date("2026-07-21T08:01:00.000Z");
    const completedTask = await application.finishFocusSession(owner.actor, taskSessionId, {
      expectedVersion: 1,
    });

    const habitSessionId = randomUUID();
    testInstant = new Date("2026-07-21T08:02:00.000Z");
    await application.startFocusSession(owner.actor, {
      id: habitSessionId,
      kind: "focus",
      mode: "stopwatch",
      plannedSeconds: null,
      taskId: null,
      habitId: owner.habitId,
    });
    testInstant = new Date("2026-07-21T08:03:00.000Z");
    const completedHabit = await application.finishFocusSession(owner.actor, habitSessionId, {
      expectedVersion: 1,
    });
    await pool.query(`update habits set archived_at = $3 where user_id = $1 and id = $2`, [
      owner.actor.userId,
      owner.habitId,
      "2026-07-21T08:03:30.000Z",
    ]);

    const history = await application.listRecentFocusSessions(owner.actor);
    expect(history.items).toHaveLength(2);
    expect(history.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          session: expect.objectContaining({ id: taskSessionId }),
          link: {
            kind: "task",
            id: owner.taskId,
            label: null,
            availability: "unavailable",
          },
        }),
        expect.objectContaining({
          session: expect.objectContaining({ id: habitSessionId }),
          link: {
            kind: "habit",
            id: owner.habitId,
            label: null,
            availability: "unavailable",
          },
        }),
      ]),
    );

    testInstant = new Date("2026-07-21T08:04:00.000Z");
    await expect(
      application.correctCompletedSession(owner.actor, taskSessionId, {
        expectedVersion: completedTask.session.version,
        patch: { durationSeconds: 61 },
      }),
    ).resolves.toMatchObject({
      id: taskSessionId,
      taskId: owner.taskId,
      accumulatedActiveSeconds: 61,
      version: 3,
    });
    await expect(
      application.correctCompletedSession(owner.actor, habitSessionId, {
        expectedVersion: completedHabit.session.version,
        patch: { link: { kind: "task", id: owner.taskId } },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    for (const link of [
      { taskId: owner.taskId, habitId: null },
      { taskId: null, habitId: owner.habitId },
    ] as const) {
      await expect(
        application.startFocusSession(owner.actor, {
          id: randomUUID(),
          kind: "focus",
          mode: "stopwatch",
          plannedSeconds: null,
          ...link,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    }
  });

  it("derives local-day totals across New York spring-forward boundaries and excludes other users", async () => {
    for (const endedAt of [
      "2026-03-08T04:59:59.000Z",
      "2026-03-08T05:00:00.000Z",
      "2026-03-09T03:59:59.000Z",
      "2026-03-09T04:00:00.000Z",
    ]) {
      await completeStopwatchAt(owner.actor, endedAt, 1);
    }
    await completeBreakAt(owner.actor, "2026-03-09T04:05:00.000Z", 60);
    await completeStopwatchAt(stranger.actor, "2026-03-09T04:10:00.000Z", 300);
    testInstant = new Date("2026-03-09T04:30:00.000Z");

    timezones.set(owner.actor.userId, "America/New_York");
    const newYork = await application.getFocusSummary(owner.actor);
    expect(newYork).toMatchObject({
      timezone: "America/New_York",
      todayLocalDate: "2026-03-09",
      todaySeconds: 1,
      sevenDaySeconds: 4,
    });
    expect(newYork.days.map(({ localDate }) => localDate)).toEqual([
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
    ]);
    expect(dayTotal(newYork, "2026-03-07")).toBe(1);
    expect(dayTotal(newYork, "2026-03-08")).toBe(2);
    expect(dayTotal(newYork, "2026-03-09")).toBe(1);

    timezones.set(owner.actor.userId, "Asia/Singapore");
    const singapore = await application.getFocusSummary(owner.actor);
    expect(singapore).toMatchObject({
      timezone: "Asia/Singapore",
      todayLocalDate: "2026-03-09",
      todaySeconds: 2,
      sevenDaySeconds: 4,
    });
    expect(dayTotal(singapore, "2026-03-08")).toBe(2);
    expect(dayTotal(singapore, "2026-03-09")).toBe(2);

    timezones.set(owner.actor.userId, "UTC");
    await expect(application.getFocusSummary(owner.actor)).resolves.toMatchObject({
      timezone: "UTC",
      todaySeconds: 2,
      sevenDaySeconds: 4,
    });
    await expect(application.getFocusSummary(stranger.actor)).resolves.toMatchObject({
      timezone: "UTC",
      todaySeconds: 300,
      sevenDaySeconds: 300,
    });
  });

  it("rejects client-supplied timer facts and a regressing authoritative clock without changing the row", async () => {
    const rejectedId = randomUUID();
    await expect(
      application.startFocusSession(owner.actor, {
        id: rejectedId,
        kind: "focus",
        mode: "stopwatch",
        plannedSeconds: null,
        taskId: null,
        habitId: null,
        startedAt: "1999-01-01T00:00:00.000Z",
      } as never),
    ).rejects.toThrow();
    await expect(countSessions(owner.actor.userId, rejectedId)).resolves.toBe(0);

    const sessionId = randomUUID();
    await application.startFocusSession(owner.actor, {
      id: sessionId,
      kind: "focus",
      mode: "stopwatch",
      plannedSeconds: null,
      taskId: null,
      habitId: null,
    });
    testInstant = new Date("2026-07-21T12:00:00.000Z");
    await expect(
      application.finishFocusSession(owner.actor, sessionId, {
        expectedVersion: 1,
        endedAt: "2099-01-01T00:00:00.000Z",
        accumulatedActiveSeconds: 2_147_483_647,
      } as never),
    ).rejects.toThrow();
    await expect(readSession(owner.actor.userId, sessionId)).resolves.toMatchObject({
      state: "active",
      accumulated_active_seconds: 0,
      version: 1,
    });

    testInstant = new Date("2026-07-21T07:59:59.000Z");
    await expect(
      application.pauseFocusSession(owner.actor, sessionId, { expectedVersion: 1 }),
    ).rejects.toThrow(/cannot precede/u);
    await expect(readSession(owner.actor.userId, sessionId)).resolves.toMatchObject({
      state: "active",
      accumulated_active_seconds: 0,
      version: 1,
    });

    testInstant = new Date("2026-07-21T08:00:10.999Z");
    const authoritative = await application.finishFocusSession(owner.actor, sessionId, {
      expectedVersion: 1,
    });
    expect(authoritative).toMatchObject({
      authoritativeAt: "2026-07-21T08:00:10.999Z",
      elapsedActiveSeconds: 10,
      session: { accumulatedActiveSeconds: 10, version: 2 },
    });
  });
});

type OwnerGraph = Readonly<{
  actor: AuthenticatedActor;
  taskId: string;
  habitId: string;
}>;

async function createOwnerGraph(marker: string): Promise<OwnerGraph> {
  const userId = await insertUser(pool, marker);
  const listId = randomUUID();
  const taskId = randomUUID();
  const habitId = randomUUID();
  await pool.query(
    `insert into task_lists (id,user_id,name,color_token,rank,kind)
     values ($1,$2,$3,'slate','a0','regular')`,
    [listId, userId, `Focus list ${marker}`],
  );
  await pool.query(
    `insert into tasks (id,user_id,list_id,title,description_md,rank)
     values ($1,$2,$3,$4,'','a0')`,
    [taskId, userId, listId, `Focus task ${marker}`],
  );
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into habits (id,user_id,title,icon,color_token,goal_kind)
       values ($1,$2,$3,'F','mint','boolean')`,
      [habitId, userId, `Focus habit ${marker}`],
    );
    await client.query(
      `insert into habit_schedules (user_id,habit_id,kind,timezone,start_date)
       values ($1,$2,'daily','UTC','2026-01-01')`,
      [userId, habitId],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return { actor: { userId }, taskId, habitId };
}

async function completeStopwatchAt(
  actor: AuthenticatedActor,
  endedAt: string,
  durationSeconds: number,
): Promise<FocusTimerSnapshot> {
  const end = new Date(endedAt);
  testInstant = new Date(end.getTime() - durationSeconds * 1_000);
  const id = randomUUID();
  await application.startFocusSession(actor, {
    id,
    kind: "focus",
    mode: "stopwatch",
    plannedSeconds: null,
    taskId: null,
    habitId: null,
  });
  testInstant = end;
  return application.finishFocusSession(actor, id, { expectedVersion: 1 });
}

async function completeBreakAt(
  actor: AuthenticatedActor,
  endedAt: string,
  durationSeconds: number,
): Promise<FocusTimerSnapshot> {
  const end = new Date(endedAt);
  testInstant = new Date(end.getTime() - durationSeconds * 1_000);
  const id = randomUUID();
  await application.startFocusSession(actor, {
    id,
    kind: "break",
    mode: "pomodoro",
    plannedSeconds: 300,
    taskId: null,
    habitId: null,
  });
  testInstant = end;
  return application.finishFocusSession(actor, id, { expectedVersion: 1 });
}

function dayTotal(
  summary: Awaited<ReturnType<FocusApplication["getFocusSummary"]>>,
  localDate: string,
): number {
  return summary.days.find((day) => day.localDate === localDate)?.totalSeconds ?? 0;
}

async function countUnfinished(userId: string): Promise<number> {
  const result = await pool.query<{ count: number }>(
    `select count(*)::int as count
       from focus_sessions
      where user_id = $1 and state in ('active','paused')`,
    [userId],
  );
  return result.rows[0]?.count ?? 0;
}

async function countSessions(userId: string, id: string): Promise<number> {
  const result = await pool.query<{ count: number }>(
    `select count(*)::int as count from focus_sessions where user_id = $1 and id = $2`,
    [userId, id],
  );
  return result.rows[0]?.count ?? 0;
}

async function readSession(userId: string, id: string) {
  const result = await pool.query<{
    state: string;
    task_id: string | null;
    habit_id: string | null;
    accumulated_active_seconds: number;
    version: number;
  }>(
    `select state,task_id,habit_id,accumulated_active_seconds,version
       from focus_sessions where user_id = $1 and id = $2`,
    [userId, id],
  );
  return result.rows[0] ?? null;
}
