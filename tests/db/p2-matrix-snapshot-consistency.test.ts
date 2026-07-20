import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  TaskOccurrenceRangeQuery,
  TaskPlanningSnapshotRequest,
  TaskPlanningSnapshotResult,
  TaskPlanningSourceQuery,
} from "../../modules/tasks/application/contracts/index.ts";
import { createInboxUseCases } from "../../modules/tasks/application/inbox.ts";
import { createBoundedOccurrenceSnapshotReader } from "../../modules/tasks/application/occurrence-reader.ts";
import { createTaskPlanningSnapshotReader } from "../../modules/tasks/application/task-planning-snapshot-reader.ts";
import { createTaskPlanningSourceSnapshotReader } from "../../modules/tasks/application/task-planning-source-reader.ts";
import { createPostgresTaskReadSnapshot } from "../../modules/tasks/application/task-read-snapshot.ts";
import { createTasksApplication } from "../../modules/tasks/application/tasks-application.ts";
import { RruleRecurrenceExpander } from "../../modules/tasks/infrastructure/recurrence/rrule-expander.ts";
import type { AuthenticatedActor } from "../../shared/auth/actor.ts";
import type { Database, DatabaseTransaction } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";
import type { Clock } from "../../shared/time/clock.ts";

import { createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("p2_matrix_snapshot_consistency");
const now = new Date("2026-07-19T01:00:00.000Z");
const clock: Clock = { now: () => new Date(now) };
const targetTaskId = "10000000-0000-4000-8000-000000000001";
const fillerTaskIds = [
  "20000000-0000-4000-8000-000000000001",
  "30000000-0000-4000-8000-000000000001",
] as const;
const matrixRequest = {
  timeZone: "UTC",
  taskQuery: { kind: "all_open", limit: 2 },
  occurrenceQueries: [
    {
      rangeStartDate: "2026-06-18",
      rangeEndDate: "2026-07-19",
      rangeStartAt: "2026-06-18T00:00:00.000Z",
      rangeEndAt: "2026-07-19T00:00:00.000Z",
      limit: 1,
    },
    {
      rangeStartDate: "2026-07-19",
      rangeEndDate: "2026-09-19",
      rangeStartAt: "2026-07-19T00:00:00.000Z",
      rangeEndAt: "2026-09-19T00:00:00.000Z",
      limit: 2,
    },
  ],
} as const satisfies TaskPlanningSnapshotRequest;

let pool: Pool;
let database: Database;
let application: ReturnType<typeof createTasksApplication>;

describe("P2 Matrix composite PostgreSQL snapshot consistency", () => {
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

  it("keeps all-open, overlap, and forward pages on one capped actor snapshot across a cutover", async () => {
    const owner = { userId: await insertUser(pool, "p2-matrix-snapshot-owner") };
    const stranger = { userId: await insertUser(pool, "p2-matrix-snapshot-stranger") };
    const inboxes = createInboxUseCases({ database, clock });
    const ownerInboxId = (await inboxes.ensureInbox(owner.userId)).id;
    const strangerInboxId = (await inboxes.ensureInbox(stranger.userId)).id;

    await createSpanningTask(owner, ownerInboxId, targetTaskId, "Owner lifecycle");
    await createSpanningTask(owner, ownerInboxId, fillerTaskIds[0], "Owner filler one");
    await createSpanningTask(owner, ownerInboxId, fillerTaskIds[1], "Owner filler two");
    await createSpanningTask(stranger, strangerInboxId, targetTaskId, "Other tenant one-off");

    const barrier = controlledBarrier();
    const duringReader = createTracedMatrixReader(barrier.checkpoint);
    const duringCutoverRead = duringReader.reader.readPlanningSnapshot(owner, matrixRequest);
    await barrier.reached;
    try {
      await application.recurrences.setRecurrence(owner, targetTaskId, {
        expectedVersion: 1,
        definition: {
          preset: { kind: "weekly", interval: 1, weekdays: [6] },
          end: { kind: "never" },
        },
      });
    } finally {
      barrier.release();
    }

    const duringCutover = await duringCutoverRead;
    expectMatrixRepresentation(duringCutover, "one_off", false);
    expectCappedOwnerPages(duringCutover);
    expectTrace(duringReader.trace, duringReader.transactions);

    const afterReader = createTracedMatrixReader();
    const afterCutover = await afterReader.reader.readPlanningSnapshot(owner, matrixRequest);
    expectMatrixRepresentation(afterCutover, "recurring", true);
    expectCappedOwnerPages(afterCutover);
    expectTrace(afterReader.trace, afterReader.transactions);

    const strangerReader = createTracedMatrixReader();
    const strangerSnapshot = await strangerReader.reader.readPlanningSnapshot(stranger, matrixRequest);
    expectMatrixRepresentation(strangerSnapshot, "one_off", false);
    expect(strangerSnapshot.taskPage).toMatchObject({ truncated: false });
    expect(strangerSnapshot.occurrencePages).toHaveLength(2);
    for (const page of strangerSnapshot.occurrencePages) {
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({ task: { title: "Other tenant one-off", version: 1 } });
      expect(page.truncation).toMatchObject({ truncated: false, reasons: [] });
    }
    expect(allProjectedTitles(strangerSnapshot)).not.toContain("Owner lifecycle");
    expectTrace(strangerReader.trace, strangerReader.transactions);
  }, 30_000);
});

async function createSpanningTask(actor: AuthenticatedActor, inboxId: string, taskId: string, title: string) {
  await application.tasks.createTaskWithSchedule(actor, taskId, {
    title,
    descriptionMd: "",
    priority: "none",
    listId: inboxId,
    sectionId: null,
    parentTaskId: null,
    placement: { kind: "end" },
    schedule: { kind: "all_day", startDate: "2026-07-18", endDate: "2026-07-20" },
  });
}

type ReadTrace =
  | Readonly<{ kind: "tasks"; query: TaskPlanningSourceQuery }>
  | Readonly<{ kind: "occurrences"; query: TaskOccurrenceRangeQuery; timeZone: string }>;

function createTracedMatrixReader(afterFirstOccurrence?: () => Promise<void>) {
  const trace: ReadTrace[] = [];
  const transactions: DatabaseTransaction[] = [];
  const readTasks = createTaskPlanningSourceSnapshotReader({ taskSchedules: schema.taskSchedules });
  const readOccurrences = createBoundedOccurrenceSnapshotReader({
    taskSchedules: schema.taskSchedules,
    expansion: new RruleRecurrenceExpander(),
  });
  let occurrenceReads = 0;

  return {
    trace,
    transactions,
    reader: createTaskPlanningSnapshotReader({
      snapshot: createPostgresTaskReadSnapshot(database),
      readOpenTasksInSnapshot: async (actor, query, transaction) => {
        trace.push({ kind: "tasks", query });
        transactions.push(transaction);
        return readTasks(actor, query, transaction);
      },
      readOccurrencesInSnapshot: async (actor, query, transaction, timeZone) => {
        trace.push({ kind: "occurrences", query, timeZone });
        transactions.push(transaction);
        const page = await readOccurrences(actor, query, transaction, timeZone);
        occurrenceReads += 1;
        if (occurrenceReads === 1) await afterFirstOccurrence?.();
        return page;
      },
    }),
  } as const;
}

function expectMatrixRepresentation(
  snapshot: TaskPlanningSnapshotResult,
  expectedKind: "one_off" | "recurring",
  recurrenceRoot: boolean,
) {
  const canonicalTarget = snapshot.taskPage.items.find(({ task }) => task.id === targetTaskId);
  expect(canonicalTarget).toMatchObject({
    task: { id: targetTaskId, version: recurrenceRoot ? 2 : 1 },
    recurrenceRoot,
  });

  expect(snapshot.occurrencePages).toHaveLength(2);
  for (const page of snapshot.occurrencePages) {
    const targetRows = page.items.filter(({ task }) => task.id === targetTaskId);
    expect(targetRows.length).toBeGreaterThan(0);
    expect(new Set(targetRows.map(({ projectionKind }) => projectionKind))).toEqual(new Set([expectedKind]));
  }
}

function expectCappedOwnerPages(snapshot: TaskPlanningSnapshotResult) {
  expect(snapshot.taskPage.items).toHaveLength(matrixRequest.taskQuery.limit);
  expect(snapshot.taskPage.truncated).toBe(true);
  expect(snapshot.occurrencePages[0]?.items).toHaveLength(matrixRequest.occurrenceQueries[0].limit);
  expect(snapshot.occurrencePages[1]?.items).toHaveLength(matrixRequest.occurrenceQueries[1].limit);
  for (const page of snapshot.occurrencePages) {
    expect(page.truncation.truncated).toBe(true);
    expect(page.truncation.reasons).toContain("output_limit");
  }
}

function expectTrace(trace: readonly ReadTrace[], transactions: readonly DatabaseTransaction[]) {
  expect(trace).toEqual([
    { kind: "tasks", query: matrixRequest.taskQuery },
    { kind: "occurrences", query: matrixRequest.occurrenceQueries[0], timeZone: "UTC" },
    { kind: "occurrences", query: matrixRequest.occurrenceQueries[1], timeZone: "UTC" },
  ]);
  expect(trace.map(({ query }) => query.limit)).toEqual([2, 1, 2]);
  expect(transactions).toHaveLength(3);
  expect(transactions.every((transaction) => transaction === transactions[0])).toBe(true);
}

function allProjectedTitles(snapshot: TaskPlanningSnapshotResult) {
  return [
    ...snapshot.taskPage.items.map(({ task }) => task.title),
    ...snapshot.occurrencePages.flatMap(({ items }) => items.map(({ task }) => task.title)),
  ];
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
