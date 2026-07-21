import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readPortablePlannerProposals } from "../../modules/assistant/index.ts";
import { readPortableFocus } from "../../modules/focus/index.ts";
import { readPortableHabits } from "../../modules/habits/index.ts";
import { readPortableIdentity } from "../../modules/identity/index.ts";
import { readPortableTaskReminders } from "../../modules/notifications/index.ts";
import {
  createPortabilityApplication,
  createPostgresExportSnapshot,
} from "../../modules/portability/index.ts";
import { readPortableTasks } from "../../modules/tasks/index.ts";
import type { AuthenticatedActor } from "../../shared/auth/actor.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";

import {
  EXPORT_INSTANT,
  RECORD_INSTANT,
  portableEntityIds,
  seedPortableTenant,
} from "./support/export-test-data.ts";
import { createWp02SchemaFixture } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("portability_snapshot");
const reminderId = "0e555555-5555-4555-8555-555555555555";
let pool: Pool;
let database: Database;
let owner: AuthenticatedActor;
let seed: Awaited<ReturnType<typeof seedPortableTenant>>;

describe("portable export PostgreSQL snapshot", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema });
    owner = { userId: randomUUID() };
    seed = await seedPortableTenant(pool, {
      actor: owner,
      email: `snapshot-${owner.userId}@example.test`,
      marker: "SNAPSHOT_BEFORE",
      timezone: "Asia/Singapore",
      timedStartInput: "2026-07-20T09:00:00+08:00",
      timedEndInput: "2026-07-20T10:00:00+08:00",
      timedStartUtc: "2026-07-20T01:00:00.000Z",
      timedEndUtc: "2026-07-20T02:00:00.000Z",
    });
    await pool.query(
      `insert into task_reminders
         (id, user_id, task_id, kind, remind_at, offset_minutes, enabled, version, created_at, updated_at)
       values ($1, $2, $3, 'absolute', $4, null, true, 2, $5, $5)`,
      [reminderId, owner.userId, portableEntityIds.rootTask, "2026-08-01T00:00:00.000Z", RECORD_INSTANT],
    );
  });

  afterAll(async () => fixture.teardown());

  it("holds one repeatable-read view while a coordinated cross-module mutation commits", async () => {
    const identityRead = deferred();
    const continueSnapshot = deferred();
    const application = createPortabilityApplication({
      snapshot: createPostgresExportSnapshot(database),
      clock: { now: () => new Date(EXPORT_INSTANT) },
      readIdentity: async (actor, transaction) => {
        const identity = await readPortableIdentity(actor, transaction);
        identityRead.resolve();
        await continueSnapshot.promise;
        return identity;
      },
      readTasks: readPortableTasks,
      readHabits: readPortableHabits,
      readFocus: readPortableFocus,
      readNotifications: readPortableTaskReminders,
      readProposals: readPortablePlannerProposals,
    });

    const inFlightExport = application.exportUserData(owner);
    await identityRead.promise;
    let mutationError: unknown;
    try {
      await commitConcurrentMutation();
    } catch (error) {
      mutationError = error;
    } finally {
      continueSnapshot.resolve();
    }
    const duringMutation = await inFlightExport;
    if (mutationError !== undefined) throw mutationError;

    const rootDuringMutation = duringMutation.tasks.tasks.find(({ id }) => id === portableEntityIds.rootTask);
    const allDayDuringMutation = duringMutation.tasks.tasks.find(
      ({ id }) => id === portableEntityIds.allDayTask,
    );
    const recurrenceDuringMutation = duringMutation.tasks.recurrenceDefinitions.find(
      ({ taskId }) => taskId === portableEntityIds.allDayTask,
    );
    const habitDuringMutation = duringMutation.habits.habits.find(
      ({ id }) => id === portableEntityIds.quantityHabit,
    );
    const habitLogDuringMutation = duringMutation.habits.logs.find(
      ({ id }) => id === portableEntityIds.quantityHabitLog,
    );
    const focusDuringMutation = duringMutation.focus.sessions.find(
      ({ id }) => id === portableEntityIds.taskFocusSession,
    );
    const reminderDuringMutation = duringMutation.notifications.reminders.find(({ id }) => id === reminderId);
    expect(duringMutation).toMatchObject({
      schemaVersion: 5,
      notifications: { schemaVersion: 1 },
    });
    expect(duringMutation.identity.profile.name).toBe(seed.ownerName);
    expect(rootDuringMutation).toMatchObject({ title: seed.rootTaskTitle, version: 1 });
    expect(allDayDuringMutation?.version).toBe(3);
    expect(recurrenceDuringMutation).toMatchObject({
      kind: "all_day",
      projectionEndDate: null,
    });
    expect(habitDuringMutation).toMatchObject({
      title: "SNAPSHOT_BEFORE reading habit",
      version: 1,
    });
    expect(habitLogDuringMutation).toMatchObject({ quantity: 24.5, version: 1 });
    expect(focusDuringMutation).toMatchObject({ accumulatedActiveSeconds: 1_500, version: 1 });
    expect(reminderDuringMutation).toMatchObject({
      taskId: portableEntityIds.rootTask,
      version: 2,
      spec: { kind: "absolute", remindAt: "2026-08-01T00:00:00.000Z" },
    });
    expect(
      duringMutation.tasks.occurrenceEvents.some(
        ({ id }) => id === portableEntityIds.concurrentOccurrenceEvent,
      ),
    ).toBe(false);

    const afterCommit = await createPortabilityApplication({
      snapshot: createPostgresExportSnapshot(database),
      clock: { now: () => new Date(EXPORT_INSTANT) },
    }).exportUserData(owner);
    const rootAfterCommit = afterCommit.tasks.tasks.find(({ id }) => id === portableEntityIds.rootTask);
    const allDayAfterCommit = afterCommit.tasks.tasks.find(({ id }) => id === portableEntityIds.allDayTask);
    const recurrenceAfterCommit = afterCommit.tasks.recurrenceDefinitions.find(
      ({ taskId }) => taskId === portableEntityIds.allDayTask,
    );
    const habitAfterCommit = afterCommit.habits.habits.find(
      ({ id }) => id === portableEntityIds.quantityHabit,
    );
    const habitLogAfterCommit = afterCommit.habits.logs.find(
      ({ id }) => id === portableEntityIds.quantityHabitLog,
    );
    const focusAfterCommit = afterCommit.focus.sessions.find(
      ({ id }) => id === portableEntityIds.taskFocusSession,
    );
    const reminderAfterCommit = afterCommit.notifications.reminders.find(({ id }) => id === reminderId);
    expect(afterCommit.identity.profile.name).toBe("SNAPSHOT_AFTER owner");
    expect(rootAfterCommit).toMatchObject({
      title: seed.updatedRootTaskTitle,
      version: 2,
      updatedAt: "2026-07-19T16:30:45.678Z",
    });
    expect(allDayAfterCommit).toMatchObject({ version: 4, updatedAt: "2026-07-19T16:30:45.678Z" });
    expect(recurrenceAfterCommit).toMatchObject({
      kind: "all_day",
      projectionEndDate: "2026-07-21",
      updatedAt: "2026-07-19T16:30:45.678Z",
    });
    expect(habitAfterCommit).toMatchObject({
      title: "SNAPSHOT_AFTER reading habit",
      version: 2,
      updatedAt: "2026-07-19T16:30:45.678Z",
    });
    expect(habitLogAfterCommit).toMatchObject({
      quantity: 30,
      version: 2,
      updatedAt: "2026-07-19T16:30:45.678Z",
    });
    expect(focusAfterCommit).toMatchObject({
      accumulatedActiveSeconds: 1_800,
      version: 2,
      updatedAt: "2026-07-19T16:30:45.678Z",
    });
    expect(reminderAfterCommit).toMatchObject({
      version: 3,
      spec: { kind: "absolute", remindAt: "2026-08-02T00:00:00.000Z" },
      updatedAt: "2026-07-19T16:30:45.678Z",
    });
    expect(
      afterCommit.tasks.occurrenceEvents.find(({ id }) => id === portableEntityIds.concurrentOccurrenceEvent),
    ).toMatchObject({
      taskId: portableEntityIds.allDayTask,
      occurrenceKey: "o1.Y29uY3VycmVudA",
      state: "skipped",
      taskVersion: 4,
    });
  });
});

async function commitConcurrentMutation() {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`update "user" set name = $1, updated_at = $2 where id = $3`, [
      "SNAPSHOT_AFTER owner",
      "2026-07-19T16:30:45.678Z",
      owner.userId,
    ]);
    await client.query(
      `update tasks
          set title = $1, version = version + 1, updated_at = $2
        where user_id = $3 and id = $4`,
      [seed.updatedRootTaskTitle, "2026-07-19T16:30:45.678Z", owner.userId, portableEntityIds.rootTask],
    );
    await client.query(
      `update tasks
          set version = version + 1, updated_at = $1
        where user_id = $2 and id = $3`,
      ["2026-07-19T16:30:45.678Z", owner.userId, portableEntityIds.allDayTask],
    );
    await client.query(
      `update task_recurrences
          set projection_end_date = $1, updated_at = $2
        where user_id = $3 and task_id = $4`,
      ["2026-07-21", "2026-07-19T16:30:45.678Z", owner.userId, portableEntityIds.allDayTask],
    );
    await client.query(
      `insert into task_occurrence_events
         (id, user_id, task_id, occurrence_key, state, task_version, effective_at, created_at)
       values ($1, $2, $3, 'o1.Y29uY3VycmVudA', 'skipped', 4, $4, $4)`,
      [
        portableEntityIds.concurrentOccurrenceEvent,
        owner.userId,
        portableEntityIds.allDayTask,
        "2026-07-19T16:30:45.678Z",
      ],
    );
    await client.query(
      `update habits
          set title = $1, version = version + 1, updated_at = $2
        where user_id = $3 and id = $4`,
      [
        "SNAPSHOT_AFTER reading habit",
        "2026-07-19T16:30:45.678Z",
        owner.userId,
        portableEntityIds.quantityHabit,
      ],
    );
    await client.query(
      `update habit_logs
          set quantity = 30.000, version = version + 1, updated_at = $1
        where user_id = $2 and id = $3`,
      ["2026-07-19T16:30:45.678Z", owner.userId, portableEntityIds.quantityHabitLog],
    );
    await client.query(
      `update focus_sessions
          set accumulated_active_seconds = 1800, version = version + 1, updated_at = $1
        where user_id = $2 and id = $3`,
      ["2026-07-19T16:30:45.678Z", owner.userId, portableEntityIds.taskFocusSession],
    );
    await client.query(
      `update task_reminders
          set remind_at = $1, version = version + 1, updated_at = $2
        where user_id = $3 and id = $4`,
      ["2026-08-02T00:00:00.000Z", "2026-07-19T16:30:45.678Z", owner.userId, reminderId],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve } as const;
}
