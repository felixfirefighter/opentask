import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createInboxUseCases } from "../../modules/tasks/application/inbox.ts";
import { createTaskRecurrenceApplication } from "../../modules/tasks/application/recurrence-application.ts";
import type { TaskReadSnapshot } from "../../modules/tasks/application/task-read-snapshot.ts";
import { createTasksApplication } from "../../modules/tasks/application/tasks-application.ts";
import { RruleRecurrenceExpander } from "../../modules/tasks/infrastructure/recurrence/rrule-expander.ts";
import type { AuthenticatedActor } from "../../shared/auth/actor.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";
import type { Clock } from "../../shared/time/clock.ts";

import { createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("p2_recurrence_detail_snapshot_consistency");
const now = new Date("2026-07-19T01:00:00.000Z");
const clock: Clock = { now: () => new Date(now) };

let pool: Pool;
let database: Database;
let application: ReturnType<typeof createTasksApplication>;

describe("P2 recurrence-detail PostgreSQL snapshot consistency", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema });
    application = createTasksApplication({
      database,
      clock,
      taskSchedules: schema.taskSchedules,
      resolveUserTimezone: async () => "UTC",
    });
  }, 60_000);

  afterAll(async () => fixture.teardown(), 30_000);

  it("returns one actor-scoped recurrence aggregate from wholly before or after a concurrent cutover", async () => {
    const owner = { userId: await insertUser(pool, "p2-recurrence-snapshot-owner") };
    const stranger = { userId: await insertUser(pool, "p2-recurrence-snapshot-stranger") };
    const inboxes = createInboxUseCases({ database, clock });
    const ownerInboxId = (await inboxes.ensureInbox(owner.userId)).id;
    const strangerInboxId = (await inboxes.ensureInbox(stranger.userId)).id;
    const taskId = randomUUID();

    await createMonthlySeries(owner, ownerInboxId, taskId, "Owner before cutover", 1);
    await createDailySeries(stranger, strangerInboxId, taskId, "Other tenant series", 7);

    const barrier = controlledBarrier();
    const recurrenceReader = createTaskRecurrenceApplication({
      database,
      clock,
      taskSchedules: schema.taskSchedules,
      expansion: new RruleRecurrenceExpander(),
      resolveUserTimezone: async () => "UTC",
      snapshot: snapshotWithBarrier(owner.userId, barrier.checkpoint),
    });

    const inFlightRead = recurrenceReader.getRecurrence(owner, taskId);
    await barrier.reached;
    try {
      await commitAggregateCutover(owner.userId, taskId);
    } finally {
      barrier.release();
    }

    await expect(inFlightRead).resolves.toMatchObject({
      taskId,
      taskVersion: 2,
      timezone: "UTC",
      definition: {
        preset: { kind: "monthly", interval: 1 },
        end: { kind: "never" },
      },
      cutover: {
        kind: "all_day",
        projectionStartDate: "2026-07-20",
        projectionEndDate: null,
      },
      lifecycle: "active",
    });

    await expect(application.recurrences.getRecurrence(owner, taskId)).resolves.toMatchObject({
      taskId,
      taskVersion: 3,
      timezone: "UTC",
      definition: {
        preset: { kind: "monthly", interval: 2 },
        end: { kind: "never" },
      },
      cutover: {
        kind: "all_day",
        projectionStartDate: "2026-07-22",
        projectionEndDate: null,
      },
      lifecycle: "active",
    });

    await expect(application.recurrences.getRecurrence(stranger, taskId)).resolves.toMatchObject({
      taskId,
      taskVersion: 2,
      timezone: "UTC",
      definition: {
        preset: { kind: "daily", interval: 7 },
        end: { kind: "never" },
      },
      cutover: {
        kind: "all_day",
        projectionStartDate: "2026-07-20",
        projectionEndDate: null,
      },
      lifecycle: "active",
    });
  }, 30_000);
});

async function createMonthlySeries(
  actor: AuthenticatedActor,
  inboxId: string,
  taskId: string,
  title: string,
  interval: number,
) {
  await createScheduledTask(actor, inboxId, taskId, title);
  await application.recurrences.setRecurrence(actor, taskId, {
    expectedVersion: 1,
    definition: {
      preset: { kind: "monthly", interval },
      end: { kind: "never" },
    },
  });
}

async function createDailySeries(
  actor: AuthenticatedActor,
  inboxId: string,
  taskId: string,
  title: string,
  interval: number,
) {
  await createScheduledTask(actor, inboxId, taskId, title);
  await application.recurrences.setRecurrence(actor, taskId, {
    expectedVersion: 1,
    definition: {
      preset: { kind: "daily", interval },
      end: { kind: "never" },
    },
  });
}

async function createScheduledTask(
  actor: AuthenticatedActor,
  inboxId: string,
  taskId: string,
  title: string,
) {
  await application.tasks.createTaskWithSchedule(actor, taskId, {
    title,
    descriptionMd: "",
    priority: "none",
    listId: inboxId,
    sectionId: null,
    parentTaskId: null,
    placement: { kind: "end" },
    schedule: { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-21" },
  });
}

function snapshotWithBarrier(userId: string, checkpoint: () => Promise<void>): TaskReadSnapshot {
  return {
    run: (work) =>
      database.transaction(
        async (transaction) => {
          // This first MVCC read fixes PostgreSQL's repeatable-read snapshot before the writer commits.
          await transaction.execute(
            sql`select count(*) from ${schema.tasks} where ${schema.tasks.userId} = ${userId}`,
          );
          await checkpoint();
          return work(transaction);
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      ),
  };
}

function controlledBarrier() {
  let signalReached!: () => void;
  let signalRelease!: () => void;
  const reached = new Promise<void>((resolve) => {
    signalReached = resolve;
  });
  const released = new Promise<void>((resolve) => {
    signalRelease = resolve;
  });
  let used = false;
  return {
    reached,
    release: signalRelease,
    async checkpoint() {
      if (used) return;
      used = true;
      signalReached();
      await released;
    },
  } as const;
}

async function commitAggregateCutover(userId: string, taskId: string) {
  await withSecondConnection(async (client) => {
    const task = await client.query(
      `update tasks
          set title = 'Owner after cutover', version = 3, updated_at = $3
        where user_id = $1 and id = $2 and version = 2`,
      [userId, taskId, "2026-07-19T02:00:00.000Z"],
    );
    requireOneRow(task.rowCount, "task cutover");

    const recurrence = await client.query(
      `update task_recurrences
          set rrule = 'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=22',
              projection_start_date = '2026-07-22',
              updated_at = $3
        where user_id = $1 and task_id = $2`,
      [userId, taskId, "2026-07-19T02:00:00.000Z"],
    );
    requireOneRow(recurrence.rowCount, "recurrence cutover");

    const schedule = await client.query(
      `update task_schedules
          set start_date = '2026-07-22', end_date = '2026-07-24', updated_at = $3
        where user_id = $1 and task_id = $2`,
      [userId, taskId, "2026-07-19T02:00:00.000Z"],
    );
    requireOneRow(schedule.rowCount, "schedule cutover");
  });
}

async function withSecondConnection(work: (client: PoolClient) => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await work(client);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function requireOneRow(rowCount: number | null, label: string) {
  if (rowCount !== 1) throw new Error(`Expected one row for ${label}, received ${rowCount ?? 0}.`);
}
