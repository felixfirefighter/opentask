import { randomUUID } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEMO_FOCUS_HABIT_ID } from "../../modules/habits/index.ts";
import { createIdentityApplication } from "../../modules/identity/application/identity-application.ts";
import { DEMO_FOCUS_TASK_ID } from "../../modules/tasks/index.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";
import type { Clock } from "../../shared/time/clock.ts";

import { createIdentityDatabaseFixture, identityTestAuthRuntime } from "./support/identity-test-fixture.ts";

const fixture = createIdentityDatabaseFixture("p4_demo_focus");
const resetAt = new Date("2026-07-21T08:00:00.000Z");
const clock: Clock = { now: () => new Date(resetAt) };
const demoTaskFocusId = "73000000-0000-4000-8000-000000000001";
const demoHabitFocusId = "73000000-0000-4000-8000-000000000002";
const demoBreakId = "73000000-0000-4000-8000-000000000003";
let database: Database;

describe("P4 deterministic Focus demo integration", () => {
  beforeAll(async () => {
    database = await fixture.setup();
  });

  afterAll(async () => fixture.teardown());

  it("isolates, replaces, and atomically restores Focus with one captured reset instant", async () => {
    const application = createIdentityApplication({
      database,
      clock,
      authRuntime: identityTestAuthRuntime,
    });
    const first = await application.enterDemo(demoHeaders("192.0.2.71"));
    const second = await application.enterDemo(demoHeaders("192.0.2.72"));
    const firstCookie = cookiesFromSetCookie(first.setCookieHeaders);
    const firstRows = await focusRows(first.actor.userId);
    const secondRowsBefore = await focusRows(second.actor.userId);

    expect(firstRows).toEqual(secondRowsBefore.map((row) => ({ ...row, userId: first.actor.userId })));
    expect(firstRows).toEqual([
      expect.objectContaining({
        id: demoTaskFocusId,
        userId: first.actor.userId,
        taskId: DEMO_FOCUS_TASK_ID,
        habitId: null,
        kind: "focus",
        mode: "pomodoro",
        state: "completed",
        accumulatedActiveSeconds: 1_500,
        plannedSeconds: 1_500,
        startedAt: new Date("2026-07-21T07:05:00.000Z"),
        endedAt: new Date("2026-07-21T07:35:00.000Z"),
      }),
      expect.objectContaining({
        id: demoHabitFocusId,
        userId: first.actor.userId,
        taskId: null,
        habitId: DEMO_FOCUS_HABIT_ID,
        kind: "focus",
        mode: "stopwatch",
        state: "completed",
        accumulatedActiveSeconds: 1_200,
        plannedSeconds: null,
        startedAt: new Date("2026-07-19T08:00:00.000Z"),
        endedAt: new Date("2026-07-19T08:20:00.000Z"),
      }),
      expect.objectContaining({
        id: demoBreakId,
        userId: first.actor.userId,
        taskId: null,
        habitId: null,
        kind: "break",
        mode: "pomodoro",
        state: "completed",
        accumulatedActiveSeconds: 300,
        plannedSeconds: 300,
        startedAt: new Date("2026-07-21T07:41:00.000Z"),
        endedAt: new Date("2026-07-21T07:46:00.000Z"),
      }),
    ]);
    await expectOwnedDemoLinks(first.actor.userId);
    await expectOwnedDemoLinks(second.actor.userId);

    const extraId = randomUUID();
    await database
      .update(schema.focusSessions)
      .set({ accumulatedActiveSeconds: 42, version: 2 })
      .where(
        and(
          eq(schema.focusSessions.userId, first.actor.userId),
          eq(schema.focusSessions.id, demoTaskFocusId),
        ),
      );
    await database.insert(schema.focusSessions).values({
      id: extraId,
      userId: first.actor.userId,
      taskId: null,
      habitId: null,
      kind: "focus",
      mode: "stopwatch",
      state: "completed",
      startedAt: new Date("2026-07-21T06:00:00.000Z"),
      pausedAt: null,
      accumulatedActiveSeconds: 60,
      plannedSeconds: null,
      endedAt: new Date("2026-07-21T06:01:00.000Z"),
      version: 1,
      createdAt: new Date("2026-07-21T06:00:00.000Z"),
      updatedAt: new Date("2026-07-21T06:01:00.000Z"),
    });

    await expect(application.enterDemo(demoHeaders("192.0.2.71", firstCookie))).resolves.toMatchObject({
      mode: "reset",
      actor: first.actor,
    });
    expect(await focusRows(first.actor.userId)).toEqual(firstRows);
    expect(await focusRows(second.actor.userId)).toEqual(secondRowsBefore);

    await database
      .update(schema.focusSessions)
      .set({ accumulatedActiveSeconds: 777, version: 2 })
      .where(
        and(
          eq(schema.focusSessions.userId, first.actor.userId),
          eq(schema.focusSessions.id, demoTaskFocusId),
        ),
      );
    await database
      .update(schema.tasks)
      .set({ title: "Preserve this task after failed Focus seed" })
      .where(and(eq(schema.tasks.userId, first.actor.userId), eq(schema.tasks.id, DEMO_FOCUS_TASK_ID)));
    await database.execute(
      sql`alter table focus_sessions add constraint p4_demo_focus_forced_failure
          check (id <> '73000000-0000-4000-8000-000000000001'::uuid) not valid`,
    );

    try {
      await expect(application.enterDemo(demoHeaders("192.0.2.71", firstCookie))).rejects.toThrow();
      expect(await focusRows(first.actor.userId)).toContainEqual(
        expect.objectContaining({ id: demoTaskFocusId, accumulatedActiveSeconds: 777, version: 2 }),
      );
      await expect(
        database
          .select({ title: schema.tasks.title })
          .from(schema.tasks)
          .where(and(eq(schema.tasks.userId, first.actor.userId), eq(schema.tasks.id, DEMO_FOCUS_TASK_ID))),
      ).resolves.toEqual([{ title: "Preserve this task after failed Focus seed" }]);
      expect(await focusRows(second.actor.userId)).toEqual(secondRowsBefore);
    } finally {
      await database.execute(sql`alter table focus_sessions drop constraint p4_demo_focus_forced_failure`);
    }
  });
});

function focusRows(userId: string) {
  return database
    .select()
    .from(schema.focusSessions)
    .where(eq(schema.focusSessions.userId, userId))
    .orderBy(asc(schema.focusSessions.id));
}

async function expectOwnedDemoLinks(userId: string) {
  const [tasks, habits] = await Promise.all([
    database
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.userId, userId), eq(schema.tasks.id, DEMO_FOCUS_TASK_ID))),
    database
      .select({ id: schema.habits.id })
      .from(schema.habits)
      .where(and(eq(schema.habits.userId, userId), eq(schema.habits.id, DEMO_FOCUS_HABIT_ID))),
  ]);
  expect(tasks).toEqual([{ id: DEMO_FOCUS_TASK_ID }]);
  expect(habits).toEqual([{ id: DEMO_FOCUS_HABIT_ID }]);
}

function demoHeaders(clientAddress: string, cookie?: string) {
  const headers = new Headers({
    "content-type": "application/json",
    origin: identityTestAuthRuntime.baseUrl,
    "sec-fetch-site": "same-origin",
    "x-real-ip": clientAddress,
  });
  if (cookie) headers.set("cookie", cookie);
  return headers;
}

function cookiesFromSetCookie(values: readonly string[]): string {
  return values
    .map((value) => value.split(";", 1)[0])
    .filter(Boolean)
    .join("; ");
}
