import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createInboxUseCases } from "../../modules/tasks/application/inbox.ts";
import {
  createBoundedOccurrenceReader,
  createBoundedOccurrenceSnapshotReader,
} from "../../modules/tasks/application/occurrence-reader.ts";
import { createTaskPlanningSnapshotReader } from "../../modules/tasks/application/task-planning-snapshot-reader.ts";
import { createTaskPlanningSourceSnapshotReader } from "../../modules/tasks/application/task-planning-source-reader.ts";
import {
  createPostgresTaskReadSnapshot,
  type TaskReadSnapshot,
} from "../../modules/tasks/application/task-read-snapshot.ts";
import { createTasksApplication } from "../../modules/tasks/application/tasks-application.ts";
import type {
  TaskPlanningSnapshotRequest,
  TaskPlanningSnapshotResult,
} from "../../modules/tasks/application/contracts/planning-snapshot-contract.ts";
import type { TaskOccurrenceRangeQuery } from "../../modules/tasks/application/contracts/occurrence-contract.ts";
import { createOccurrenceKey } from "../../modules/tasks/domain/recurrence/occurrence-key.ts";
import { RruleRecurrenceExpander } from "../../modules/tasks/infrastructure/recurrence/rrule-expander.ts";
import type { AuthenticatedActor } from "../../shared/auth/actor.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";
import type { Clock } from "../../shared/time/clock.ts";

import { createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("p2_planning_snapshot_consistency");
const now = new Date("2026-07-19T01:00:00.000Z");
const clock: Clock = { now: () => new Date(now) };
const expansion = new RruleRecurrenceExpander();
const historicalRange = {
  rangeStartDate: "2026-07-18",
  rangeEndDate: "2026-07-19",
  rangeStartAt: "2026-07-18T00:00:00.000Z",
  rangeEndAt: "2026-07-19T00:00:00.000Z",
  limit: 10,
} as const satisfies TaskOccurrenceRangeQuery;
const planningRequest = {
  timeZone: "UTC",
  taskQuery: {
    kind: "scheduled_through",
    exclusiveEndDate: "2026-08-11",
    exclusiveEndAt: "2026-08-11T00:00:00.000Z",
    limit: 10,
  },
  occurrenceQueries: [
    {
      rangeStartDate: "2026-08-10",
      rangeEndDate: "2026-08-11",
      rangeStartAt: "2026-08-10T00:00:00.000Z",
      rangeEndAt: "2026-08-11T00:00:00.000Z",
      limit: 10,
    },
  ],
} satisfies TaskPlanningSnapshotRequest;

let pool: Pool;
let database: Database;
let application: ReturnType<typeof createTasksApplication>;

describe("P2 planning snapshot PostgreSQL consistency", () => {
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

  it("keeps late historical occurrence hydration entirely on the pre-commit snapshot", async () => {
    const { owner, ownerInboxId, stranger, strangerInboxId } = await createActors("history");
    const taskId = randomUUID();
    await createScheduledTask(owner, ownerInboxId, taskId, "Before cutover", "2026-07-18", "2026-07-19");
    await createScheduledTask(
      stranger,
      strangerInboxId,
      taskId,
      "Other tenant series",
      "2026-07-18",
      "2026-07-19",
    );
    await application.recurrences.setRecurrence(owner, taskId, {
      expectedVersion: 1,
      definition: dailyDefinition(1),
    });
    await application.recurrences.setRecurrence(stranger, taskId, {
      expectedVersion: 1,
      definition: dailyDefinition(1),
    });
    const occurrenceKey = createOccurrenceKey(taskId, { kind: "all_day", startDate: "2026-07-18" });
    await application.occurrences.transitionOccurrence(owner, taskId, {
      action: "complete",
      occurrenceKey,
      expectedVersion: 2,
    });
    await application.recurrences.setRecurrence(owner, taskId, {
      expectedVersion: 3,
      definition: dailyDefinition(1),
    });

    const barrier = controlledBarrier();
    const postgresSnapshot = createPostgresTaskReadSnapshot(database);
    const controlledSnapshot: TaskReadSnapshot = {
      run: (work) =>
        postgresSnapshot.run(async (transaction) => {
          // Establish the repeatable-read snapshot before the concurrent aggregate cutover.
          await transaction.execute(
            sql`select 1 from tasks where user_id = ${owner.userId} and id = ${taskId} limit 1`,
          );
          await barrier.checkpoint();
          return work(transaction);
        }),
    };
    const reader = createBoundedOccurrenceReader({
      snapshot: controlledSnapshot,
      readInSnapshot: createBoundedOccurrenceSnapshotReader({
        taskSchedules: schema.taskSchedules,
        expansion,
      }),
      resolveUserTimezone: async () => "UTC",
    });

    const inFlightRead = reader(owner, historicalRange);
    await barrier.reached;
    try {
      await commitHistoricalAggregateCutover(owner.userId, taskId, occurrenceKey);
    } finally {
      barrier.release();
    }
    const inFlight = await inFlightRead;

    expect(inFlight.truncation).toMatchObject({
      truncated: false,
      recurrenceRowsEvaluated: 1,
      occurrenceEventsEvaluated: 1,
    });
    expect(inFlight.items).toEqual([
      expect.objectContaining({
        projectionKind: "recurring",
        task: expect.objectContaining({ id: taskId, title: "Before cutover", version: 4 }),
        occurrence: expect.objectContaining({
          occurrenceKey,
          taskVersion: 4,
          occurrenceState: "completed",
          transitionEligible: false,
          schedule: { kind: "all_day", startDate: "2026-07-18", endDate: "2026-07-19" },
        }),
      }),
    ]);
    const afterCommit = await reader(owner, historicalRange);
    expect(afterCommit.items).toEqual([
      expect.objectContaining({
        projectionKind: "recurring",
        task: expect.objectContaining({ id: taskId, title: "After cutover", version: 5 }),
        occurrence: expect.objectContaining({
          occurrenceKey,
          taskVersion: 5,
          occurrenceState: "open",
          transitionEligible: false,
          schedule: { kind: "all_day", startDate: "2026-07-18", endDate: "2026-07-20" },
        }),
      }),
    ]);
    expect(afterCommit.items).toHaveLength(1);
    expect(afterCommit.truncation.truncated).toBe(false);
    const strangerPage = await reader(stranger, historicalRange);
    expect(strangerPage.items).toHaveLength(1);
    expect(strangerPage.items[0]).toMatchObject({
      task: { id: taskId, title: "Other tenant series", version: 2 },
    });
    expect(strangerPage.truncation.truncated).toBe(false);
  }, 30_000);

  it("keeps one-off and recurrence lifecycle cutovers on one composite snapshot", async () => {
    const { owner, ownerInboxId, stranger, strangerInboxId } = await createActors("composite");
    const taskId = randomUUID();
    await createScheduledTask(owner, ownerInboxId, taskId, "Owner lifecycle", "2026-08-10", "2026-08-11");
    await createScheduledTask(
      stranger,
      strangerInboxId,
      taskId,
      "Other tenant one-off",
      "2026-08-10",
      "2026-08-11",
    );

    const addBarrier = controlledBarrier();
    const duringAddRead = createCompositeReader(addBarrier.checkpoint).readPlanningSnapshot(
      owner,
      planningRequest,
    );
    await addBarrier.reached;
    try {
      await application.recurrences.setRecurrence(owner, taskId, {
        expectedVersion: 1,
        definition: dailyDefinition(1),
      });
    } finally {
      addBarrier.release();
    }

    const duringAdd = await duringAddRead;
    expect(targetRepresentationCounts(duringAdd, taskId)).toEqual({ oneOff: 1, recurring: 0 });
    expect(targetOccurrence(duringAdd, taskId)).toMatchObject({
      projectionKind: "one_off",
      task: { title: "Owner lifecycle", version: 1 },
    });
    expect(duringAdd.occurrencePages[0]?.truncation.truncated).toBe(false);

    const afterAdd = await createCompositeReader().readPlanningSnapshot(owner, planningRequest);
    expect(targetRepresentationCounts(afterAdd, taskId)).toEqual({ oneOff: 0, recurring: 1 });
    expect(targetOccurrence(afterAdd, taskId)).toMatchObject({
      projectionKind: "recurring",
      task: { title: "Owner lifecycle", version: 2 },
      occurrence: { taskVersion: 2, occurrenceState: "open" },
    });

    const removeBarrier = controlledBarrier();
    const duringRemoveRead = createCompositeReader(removeBarrier.checkpoint).readPlanningSnapshot(
      owner,
      planningRequest,
    );
    await removeBarrier.reached;
    try {
      await removeRecurrenceInOneCommit(owner.userId, taskId, 2);
    } finally {
      removeBarrier.release();
    }

    const duringRemove = await duringRemoveRead;
    expect(targetRepresentationCounts(duringRemove, taskId)).toEqual({ oneOff: 0, recurring: 1 });
    expect(targetOccurrence(duringRemove, taskId)).toMatchObject({
      projectionKind: "recurring",
      task: { title: "Owner lifecycle", version: 2 },
      occurrence: { taskVersion: 2 },
    });

    const afterRemove = await createCompositeReader().readPlanningSnapshot(owner, planningRequest);
    expect(targetRepresentationCounts(afterRemove, taskId)).toEqual({ oneOff: 1, recurring: 0 });
    expect(targetOccurrence(afterRemove, taskId)).toMatchObject({
      projectionKind: "one_off",
      task: { title: "Owner lifecycle", version: 3 },
    });

    const strangerSnapshot = await createCompositeReader().readPlanningSnapshot(stranger, planningRequest);
    expect(targetRepresentationCounts(strangerSnapshot, taskId)).toEqual({ oneOff: 1, recurring: 0 });
    expect(targetOccurrence(strangerSnapshot, taskId)).toMatchObject({
      projectionKind: "one_off",
      task: { title: "Other tenant one-off", version: 1 },
    });
    expect(strangerSnapshot.taskPage.items).toHaveLength(1);
    expect(strangerSnapshot.occurrencePages[0]?.truncation.truncated).toBe(false);
  }, 30_000);
});

function dailyDefinition(interval: number) {
  return { preset: { kind: "daily" as const, interval }, end: { kind: "never" as const } };
}

async function createActors(label: string) {
  const owner = { userId: await insertUser(pool, `p2-snapshot-${label}-owner`) };
  const stranger = { userId: await insertUser(pool, `p2-snapshot-${label}-stranger`) };
  const inboxes = createInboxUseCases({ database, clock });
  const ownerInboxId = (await inboxes.ensureInbox(owner.userId)).id;
  const strangerInboxId = (await inboxes.ensureInbox(stranger.userId)).id;
  return { owner, ownerInboxId, stranger, strangerInboxId } as const;
}

async function createScheduledTask(
  actor: AuthenticatedActor,
  inboxId: string,
  taskId: string,
  title: string,
  startDate: string,
  endDate: string,
) {
  await application.tasks.createTaskWithSchedule(actor, taskId, {
    title,
    descriptionMd: "",
    priority: "none",
    listId: inboxId,
    sectionId: null,
    parentTaskId: null,
    placement: { kind: "end" },
    schedule: { kind: "all_day", startDate, endDate },
  });
}

function createCompositeReader(afterTaskRead?: () => Promise<void>) {
  const readTasks = createTaskPlanningSourceSnapshotReader({ taskSchedules: schema.taskSchedules });
  return createTaskPlanningSnapshotReader({
    snapshot: createPostgresTaskReadSnapshot(database),
    readOpenTasksInSnapshot: async (actor, query, transaction) => {
      const page = await readTasks(actor, query, transaction);
      await afterTaskRead?.();
      return page;
    },
    readOccurrencesInSnapshot: createBoundedOccurrenceSnapshotReader({
      taskSchedules: schema.taskSchedules,
      expansion,
    }),
  });
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

function targetRepresentationCounts(snapshot: TaskPlanningSnapshotResult, taskId: string) {
  const oneOff = snapshot.taskPage.items.filter(
    ({ recurrenceRoot, task }) => task.id === taskId && !recurrenceRoot,
  ).length;
  const recurring = snapshot.occurrencePages
    .flatMap(({ items }) => items)
    .filter(({ projectionKind, task }) => task.id === taskId && projectionKind === "recurring").length;
  expect(oneOff + recurring).toBe(1);
  return { oneOff, recurring };
}

function targetOccurrence(snapshot: TaskPlanningSnapshotResult, taskId: string) {
  const occurrence = snapshot.occurrencePages
    .flatMap(({ items }) => items)
    .find(({ task }) => task.id === taskId);
  if (!occurrence) throw new Error("Expected the bounded target occurrence.");
  return occurrence;
}

async function commitHistoricalAggregateCutover(userId: string, taskId: string, occurrenceKey: string) {
  await withSecondConnection(async (client) => {
    const task = await client.query(
      `update tasks
          set title = 'After cutover', version = 5, updated_at = $3
        where user_id = $1 and id = $2 and version = 4
        returning version`,
      [userId, taskId, "2026-07-19T02:00:00.000Z"],
    );
    requireOneRow(task.rowCount, "task cutover");
    const recurrence = await client.query(
      `update task_recurrences
          set rrule = 'FREQ=DAILY;INTERVAL=2', projection_start_date = '2026-07-20', updated_at = $3
        where user_id = $1 and task_id = $2`,
      [userId, taskId, "2026-07-19T02:00:00.000Z"],
    );
    requireOneRow(recurrence.rowCount, "recurrence cutover");
    const schedule = await client.query(
      `update task_schedules
          set end_date = '2026-07-20', updated_at = $3
        where user_id = $1 and task_id = $2`,
      [userId, taskId, "2026-07-19T02:00:00.000Z"],
    );
    requireOneRow(schedule.rowCount, "schedule cutover");
    await client.query(
      `insert into task_occurrence_events
         (id, user_id, task_id, occurrence_key, state, task_version, effective_at, created_at)
       values ($1, $2, $3, $4, 'open', 5, $5, $5)`,
      [randomUUID(), userId, taskId, occurrenceKey, "2026-07-19T02:00:00.000Z"],
    );
  });
}

async function removeRecurrenceInOneCommit(userId: string, taskId: string, expectedVersion: number) {
  await withSecondConnection(async (client) => {
    const task = await client.query(
      `update tasks
          set version = version + 1, updated_at = $3
        where user_id = $1 and id = $2 and version = $4`,
      [userId, taskId, "2026-07-19T03:00:00.000Z", expectedVersion],
    );
    requireOneRow(task.rowCount, "task recurrence removal");
    const recurrence = await client.query(
      `delete from task_recurrences where user_id = $1 and task_id = $2`,
      [userId, taskId],
    );
    requireOneRow(recurrence.rowCount, "recurrence removal");
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
