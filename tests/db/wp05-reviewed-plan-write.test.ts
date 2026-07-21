import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createInboxBootstrapPort } from "../../modules/tasks/application/inbox.ts";
import { createTasksApplication } from "../../modules/tasks/application/tasks-application.ts";
import type { AuthenticatedActor } from "../../shared/auth/actor.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";
import type { Clock } from "../../shared/time/clock.ts";

import { createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const now = new Date("2026-07-19T01:00:00.000Z");
const clock: Clock = { now: () => new Date(now) };
const fixture = createWp02SchemaFixture("reviewed_plan_write");

let pool: Pool;
let database: Database;
let ownerA: AuthenticatedActor;
let ownerB: AuthenticatedActor;
let application: ReturnType<typeof createTasksApplication>;

describe("reviewed plan task writer PostgreSQL integration", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema });
    ownerA = { userId: await insertUser(pool, "reviewed-plan-owner-a") };
    ownerB = { userId: await insertUser(pool, "reviewed-plan-owner-b") };
    const inbox = createInboxBootstrapPort(database, clock);
    await inbox.ensureInbox(ownerA.userId);
    await inbox.ensureInbox(ownerB.userId);
    application = createTasksApplication({ database, clock, taskSchedules: schema.taskSchedules });
  });

  afterAll(async () => fixture.teardown());

  it("loads only owned open snapshots and canonical schedules under the task-owner lock", async () => {
    const listA = await createList(ownerA, "Snapshot A");
    const listB = await createList(ownerB, "Snapshot B");
    const owned = await createTask(ownerA, listA.id, "Owned");
    const completed = await createTask(ownerA, listA.id, "Completed");
    const foreign = await createTask(ownerB, listB.id, "Foreign");
    await application.schedules.setSchedule(ownerA, owned.id, {
      expectedVersion: 1,
      schedule: {
        kind: "timed",
        startAt: "2026-07-20T09:00:00+08:00",
        endAt: "2026-07-20T10:00:00+08:00",
        timezone: "Asia/Singapore",
      },
    });
    await application.tasks.transitionTaskStatus(ownerA, completed.id, {
      expectedVersion: 1,
      status: "completed",
    });

    const context = await database.transaction((transaction) =>
      application.reviewedPlanWrites.loadApplyContextForUpdate(
        ownerA,
        [owned.id, completed.id, foreign.id],
        null,
        transaction,
      ),
    );
    expect(context.tasks).toEqual([
      expect.objectContaining({
        id: owned.id,
        version: 2,
        schedule: {
          kind: "timed",
          startAt: "2026-07-20T01:00:00.000Z",
          endAt: "2026-07-20T02:00:00.000Z",
          timezone: "Asia/Singapore",
        },
      }),
    ]);
    expect(context.busyIntervals).toBeNull();
  });

  it("locks task then recurrence without taking the schedule lock early", async () => {
    const list = await createList(ownerA, "Planner lock order");
    const scheduled = await createScheduled(
      ownerA,
      list.id,
      "Schedule stays behind recurrence in lock order",
      "2026-07-25T09:00:00Z",
    );
    const recurrence = await application.recurrences.setRecurrence(ownerA, scheduled.id, {
      expectedVersion: scheduled.version,
      definition: dailyDefinition(),
    });
    const blocker = await pool.connect();
    let blockerOpen = false;
    let applyCompletion: Promise<void> | undefined;
    try {
      await blocker.query("begin");
      blockerOpen = true;
      await blocker.query(
        `select task_id from task_recurrences where user_id = $1 and task_id = $2 for update`,
        [ownerA.userId, scheduled.id],
      );
      const applyResult = database
        .transaction((transaction) =>
          application.reviewedPlanWrites.applyBatch(
            ownerA,
            {
              creates: [],
              updates: [
                {
                  id: scheduled.id,
                  expectedVersion: recurrence.task.version,
                  schedule: {
                    kind: "timed",
                    startAt: "2026-07-25T11:00:00Z",
                    endAt: "2026-07-25T11:30:00Z",
                    timezone: "UTC",
                  },
                },
              ],
            },
            transaction,
          ),
        )
        .then(
          (value) => ({ status: "fulfilled" as const, value }),
          (reason: unknown) => ({ status: "rejected" as const, reason }),
        );
      applyCompletion = applyResult.then(() => undefined);
      await waitForBlockedLock(pool, "opentask-wp02-reviewed_plan_write-isolated");

      await expect(
        pool.query(
          `select task_id from task_schedules where user_id = $1 and task_id = $2 for update nowait`,
          [ownerA.userId, scheduled.id],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        pool.query(`select id from tasks where user_id = $1 and id = $2 for update nowait`, [
          ownerA.userId,
          scheduled.id,
        ]),
      ).rejects.toMatchObject({ code: "55P03" });

      await blocker.query("commit");
      blockerOpen = false;
      const result = await applyResult;
      expect(result.status).toBe("rejected");
      if (result.status !== "rejected") throw new Error("Recurring planner edit unexpectedly succeeded.");
      expect(result.reason).toMatchObject({
        code: "CONFLICT",
        currentVersion: recurrence.task.version,
      });
    } finally {
      if (blockerOpen) await blocker.query("rollback");
      blocker.release();
      await applyCompletion;
    }
  });

  it("creates in Inbox and applies grouped detail/priority/schedule updates once per task", async () => {
    const list = await createList(ownerA, "Apply batch");
    const existing = await createTask(ownerA, list.id, "Before");
    const firstCreateId = randomUUID();
    const secondCreateId = randomUUID();

    await database.transaction((transaction) =>
      application.reviewedPlanWrites.applyBatch(
        ownerA,
        {
          creates: [
            {
              id: firstCreateId,
              title: "First created",
              descriptionMd: "From proposal",
              priority: "high",
              schedule: {
                kind: "all_day",
                startDate: "2026-07-20",
                endDate: "2026-07-21",
              },
            },
            {
              id: secondCreateId,
              title: "Second created",
              descriptionMd: "",
              priority: "none",
              schedule: null,
            },
          ],
          updates: [
            {
              id: existing.id,
              expectedVersion: 1,
              title: "After",
              descriptionMd: "Clarified",
              priority: "medium",
              schedule: {
                kind: "timed",
                startAt: "2026-07-20T03:00:00Z",
                endAt: "2026-07-20T04:00:00Z",
                timezone: "UTC",
              },
            },
          ],
        },
        transaction,
      ),
    );

    const storedExisting = await storedTask(ownerA.userId, existing.id);
    expect(storedExisting).toMatchObject({
      title: "After",
      description_md: "Clarified",
      priority: "medium",
      version: 2,
    });
    expect(await storedSchedule(ownerA.userId, existing.id)).toMatchObject({ kind: "timed" });
    const inboxId = await activeInboxId(ownerA.userId);
    const created = await Promise.all([
      storedTask(ownerA.userId, firstCreateId),
      storedTask(ownerA.userId, secondCreateId),
    ]);
    expect(created).toEqual([
      expect.objectContaining({ list_id: inboxId, version: 1 }),
      expect.objectContaining({ list_id: inboxId, version: 1 }),
    ]);
    expect(String(created[0]?.rank) < String(created[1]?.rank)).toBe(true);
    expect(await storedSchedule(ownerA.userId, firstCreateId)).toMatchObject({ kind: "all_day" });
  });

  it("excludes selected tasks from locked busy reads and preserves half-open boundaries", async () => {
    const list = await createList(ownerA, "Busy range");
    const selected = await createScheduled(ownerA, list.id, "Selected", "2026-07-20T09:00:00Z");
    const busy = await createScheduled(ownerA, list.id, "Busy", "2026-07-20T10:00:00Z");
    await createScheduled(
      ownerB,
      (await createList(ownerB, "Foreign busy")).id,
      "Foreign",
      "2026-07-20T10:00:00Z",
    );

    const context = await database.transaction((transaction) =>
      application.reviewedPlanWrites.loadApplyContextForUpdate(
        ownerA,
        [selected.id],
        {
          timeZone: "UTC",
          query: {
            rangeStartDate: "2026-07-20",
            rangeEndDate: "2026-07-21",
            rangeStartAt: "2026-07-20T09:00:00Z",
            rangeEndAt: "2026-07-20T11:00:00Z",
            limit: 500,
          },
          excludedTaskIds: [selected.id],
        },
        transaction,
      ),
    );
    expect(context.busyIntervals?.truncation.truncated).toBe(false);
    expect(context.busyIntervals?.items).toEqual([
      {
        startAt: "2026-07-20T10:00:00.000Z",
        endAt: "2026-07-20T10:30:00.000Z",
      },
    ]);
    expect(context.busyIntervals?.items).not.toContainEqual(
      expect.objectContaining({ startAt: "2026-07-20T09:00:00.000Z" }),
    );
    expect(busy.id).not.toBe(selected.id);
  });

  it("loads only open timed recurring occurrences into reviewed-plan busy context", async () => {
    const list = await createList(ownerA, "Recurring busy context");
    const recurring = await createScheduled(ownerA, list.id, "Daily timed focus", "2026-07-20T13:00:00Z");
    await application.recurrences.setRecurrence(ownerA, recurring.id, {
      expectedVersion: recurring.version,
      definition: dailyDefinition(),
    });
    const allDay = await application.tasks.createTaskWithSchedule(ownerA, randomUUID(), {
      title: "All-day recurring note",
      descriptionMd: "",
      priority: "none",
      listId: list.id,
      sectionId: null,
      parentTaskId: null,
      placement: { kind: "end" },
      schedule: { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-21" },
    });
    await application.recurrences.setRecurrence(ownerA, allDay.value.task.id, {
      expectedVersion: allDay.value.task.version,
      definition: dailyDefinition(),
    });
    const foreignList = await createList(ownerB, "Foreign recurring context");
    const foreign = await createScheduled(
      ownerB,
      foreignList.id,
      "Foreign daily focus",
      "2026-07-20T14:00:00Z",
    );
    await application.recurrences.setRecurrence(ownerB, foreign.id, {
      expectedVersion: foreign.version,
      definition: dailyDefinition(),
    });
    const range = {
      rangeStartDate: "2026-07-20",
      rangeEndDate: "2026-07-23",
      rangeStartAt: "2026-07-20T00:00:00Z",
      rangeEndAt: "2026-07-23T00:00:00Z",
      limit: 500,
    } as const;
    const occurrences = await application.occurrences.readBoundedOccurrences(ownerA, range);
    const timed = occurrences.items.filter(
      (item) => item.projectionKind === "recurring" && item.occurrence.schedule.kind === "timed",
    );
    const completed = timed[1];
    const skipped = timed[2];
    if (!completed || completed.projectionKind !== "recurring") {
      throw new Error("Expected the second timed occurrence.");
    }
    if (!skipped || skipped.projectionKind !== "recurring") {
      throw new Error("Expected the third timed occurrence.");
    }
    const completedResult = await application.occurrences.transitionOccurrence(ownerA, recurring.id, {
      action: "complete",
      occurrenceKey: completed.occurrence.occurrenceKey,
      expectedVersion: 3,
    });
    await application.occurrences.transitionOccurrence(ownerA, recurring.id, {
      action: "skip",
      occurrenceKey: skipped.occurrence.occurrenceKey,
      expectedVersion: completedResult.task.version,
    });

    const context = await database.transaction((transaction) =>
      application.reviewedPlanWrites.loadApplyContextForUpdate(
        ownerA,
        [],
        { timeZone: "UTC", query: range, excludedTaskIds: [] },
        transaction,
      ),
    );

    expect(context.busyIntervals?.truncation.truncated).toBe(false);
    const normalized = context.busyIntervals?.items.map(({ startAt, endAt }) => ({
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
    }));
    expect(normalized?.filter(({ startAt }) => startAt.includes("T13:00:00"))).toEqual([
      {
        startAt: "2026-07-20T13:00:00.000Z",
        endAt: "2026-07-20T13:30:00.000Z",
      },
    ]);
    expect(normalized?.some(({ startAt }) => startAt.includes("T14:00:00"))).toBe(false);
  });

  it("does not reserve an open historical occurrence after its recurrence cutover advances", async () => {
    let plannerNow = new Date("2026-07-19T01:00:00.000Z");
    const plannerApplication = createTasksApplication({
      database,
      clock: { now: () => new Date(plannerNow) },
      taskSchedules: schema.taskSchedules,
    });
    const list = await createList(ownerA, "Historical planner context");
    const recurring = await createScheduled(
      ownerA,
      list.id,
      "Historical occurrence must stay free",
      "2026-07-20T13:00:00Z",
    );
    const initialRule = await plannerApplication.recurrences.setRecurrence(ownerA, recurring.id, {
      expectedVersion: recurring.version,
      definition: dailyDefinition(),
    });
    const range = {
      rangeStartDate: "2026-07-20",
      rangeEndDate: "2026-07-22",
      rangeStartAt: "2026-07-20T00:00:00Z",
      rangeEndAt: "2026-07-22T00:00:00Z",
      limit: 500,
    } as const;
    const initialPage = await plannerApplication.occurrences.readBoundedOccurrences(ownerA, range);
    const firstOccurrence = initialPage.items.find(
      (item) =>
        item.projectionKind === "recurring" &&
        item.task.id === recurring.id &&
        item.occurrence.schedule.kind === "timed" &&
        new Date(item.occurrence.schedule.startAt).toISOString() === "2026-07-20T13:00:00.000Z",
    );
    if (!firstOccurrence || firstOccurrence.projectionKind !== "recurring") {
      throw new Error("Expected the first owned recurring occurrence.");
    }
    const completed = await plannerApplication.occurrences.transitionOccurrence(ownerA, recurring.id, {
      action: "complete",
      occurrenceKey: firstOccurrence.occurrence.occurrenceKey,
      expectedVersion: initialRule.task.version,
    });

    plannerNow = new Date("2026-07-20T14:00:00.000Z");
    const editedRule = await plannerApplication.recurrences.setRecurrence(ownerA, recurring.id, {
      expectedVersion: completed.task.version,
      definition: dailyDefinition(),
    });
    await plannerApplication.occurrences.transitionOccurrence(ownerA, recurring.id, {
      action: "undo",
      occurrenceKey: firstOccurrence.occurrence.occurrenceKey,
      expectedVersion: editedRule.task.version,
    });

    const foreignList = await createList(ownerB, "Foreign historical planner context");
    const foreign = await createScheduled(
      ownerB,
      foreignList.id,
      "Foreign eligible occurrence",
      "2026-07-21T14:00:00Z",
    );
    await plannerApplication.recurrences.setRecurrence(ownerB, foreign.id, {
      expectedVersion: foreign.version,
      definition: dailyDefinition(),
    });

    const ownerPage = await plannerApplication.occurrences.readBoundedOccurrences(ownerA, range);
    const historical = ownerPage.items.find(
      (item) =>
        item.projectionKind === "recurring" &&
        item.occurrence.occurrenceKey === firstOccurrence.occurrence.occurrenceKey,
    );
    if (!historical || historical.projectionKind !== "recurring") {
      throw new Error("Expected the recorded historical occurrence.");
    }
    expect(historical).toMatchObject({
      task: { id: recurring.id },
      occurrence: {
        occurrenceState: "open",
        transitionEligible: false,
        schedule: { kind: "timed" },
      },
    });
    if (historical.occurrence.schedule.kind !== "timed") {
      throw new Error("Expected the historical occurrence to remain timed.");
    }
    expect(new Date(historical.occurrence.schedule.startAt).toISOString()).toBe("2026-07-20T13:00:00.000Z");
    const eligible = ownerPage.items.find(
      (item) =>
        item.projectionKind === "recurring" &&
        item.task.id === recurring.id &&
        item.occurrence.occurrenceState === "open" &&
        item.occurrence.transitionEligible &&
        item.occurrence.schedule.kind === "timed" &&
        new Date(item.occurrence.schedule.startAt).toISOString() === "2026-07-21T13:00:00.000Z",
    );
    expect(eligible).toBeDefined();
    const foreignPage = await plannerApplication.occurrences.readBoundedOccurrences(ownerB, range);
    expect(
      foreignPage.items.find(
        (item) =>
          item.projectionKind === "recurring" &&
          item.task.id === foreign.id &&
          item.occurrence.occurrenceState === "open" &&
          item.occurrence.transitionEligible,
      ),
    ).toBeDefined();
    expect(ownerPage.items.some(({ task }) => task.id === foreign.id)).toBe(false);
    const backgroundTasks = await pool.query<{ id: string }>(
      `select id
         from tasks
        where user_id = $1 and id <> $2`,
      [ownerA.userId, recurring.id],
    );

    const context = await database.transaction((transaction) =>
      plannerApplication.reviewedPlanWrites.loadApplyContextForUpdate(
        ownerA,
        [],
        {
          timeZone: "UTC",
          query: range,
          excludedTaskIds: backgroundTasks.rows.map(({ id }) => id),
        },
        transaction,
      ),
    );

    expect(context.busyIntervals?.truncation).toEqual(expect.objectContaining({ truncated: false }));
    expect(
      context.busyIntervals?.items.map(({ startAt, endAt }) => ({
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
      })),
    ).toEqual([
      {
        startAt: "2026-07-21T13:00:00.000Z",
        endAt: "2026-07-21T13:30:00.000Z",
      },
    ]);
  });

  it("rejects planner schedule writes for active or ended recurrence rows", async () => {
    const list = await createList(ownerA, "Recurring schedule guard");
    const recurring = await createScheduled(
      ownerA,
      list.id,
      "Protected recurring schedule",
      "2026-07-20T10:00:00Z",
    );
    const recurrence = await application.recurrences.setRecurrence(ownerA, recurring.id, {
      expectedVersion: recurring.version,
      definition: dailyDefinition(),
    });

    await expect(
      database.transaction((transaction) =>
        application.reviewedPlanWrites.applyBatch(
          ownerA,
          {
            creates: [],
            updates: [
              {
                id: recurring.id,
                expectedVersion: recurrence.task.version,
                schedule: {
                  kind: "timed",
                  startAt: "2026-07-20T12:00:00Z",
                  endAt: "2026-07-20T12:30:00Z",
                  timezone: "UTC",
                },
              },
            ],
          },
          transaction,
        ),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: recurrence.task.version });
    expect(await storedSchedule(ownerA.userId, recurring.id)).toMatchObject({
      start_at: new Date("2026-07-20T10:00:00Z"),
    });

    await database.transaction((transaction) =>
      application.reviewedPlanWrites.applyBatch(
        ownerA,
        {
          creates: [],
          updates: [{ id: recurring.id, expectedVersion: recurrence.task.version, priority: "high" }],
        },
        transaction,
      ),
    );
    expect(await storedTask(ownerA.userId, recurring.id)).toMatchObject({ priority: "high", version: 4 });
    const ended = await application.recurrences.endRecurrence(ownerA, recurring.id, {
      expectedVersion: 4,
    });
    await expect(
      database.transaction((transaction) =>
        application.reviewedPlanWrites.applyBatch(
          ownerA,
          {
            creates: [],
            updates: [
              {
                id: recurring.id,
                expectedVersion: ended.task.version,
                schedule: {
                  kind: "timed",
                  startAt: "2026-07-20T12:00:00Z",
                  endAt: "2026-07-20T12:30:00Z",
                  timezone: "UTC",
                },
              },
            ],
          },
          transaction,
        ),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: ended.task.version });
  });

  it("rolls back every prior write on a later failure and denies cross-user targets", async () => {
    const listA = await createList(ownerA, "Rollback A");
    const listB = await createList(ownerB, "Rollback B");
    const first = await createTask(ownerA, listA.id, "First unchanged");
    const overflow = await createTask(ownerA, listA.id, "Overflow unchanged");
    const foreign = await createTask(ownerB, listB.id, "Foreign unchanged");
    await pool.query(`update tasks set version = 2147483647 where user_id = $1 and id = $2`, [
      ownerA.userId,
      overflow.id,
    ]);

    await expect(
      database.transaction((transaction) =>
        application.reviewedPlanWrites.applyBatch(
          ownerA,
          {
            creates: [],
            updates: [
              { id: first.id, expectedVersion: 1, priority: "high" },
              { id: overflow.id, expectedVersion: 2_147_483_647, priority: "high" },
            ],
          },
          transaction,
        ),
      ),
    ).rejects.toBeDefined();
    expect(await storedTask(ownerA.userId, first.id)).toMatchObject({ priority: "none", version: 1 });

    await expect(
      database.transaction((transaction) =>
        application.reviewedPlanWrites.applyBatch(
          ownerA,
          { creates: [], updates: [{ id: foreign.id, expectedVersion: 1, priority: "high" }] },
          transaction,
        ),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await storedTask(ownerB.userId, foreign.id)).toMatchObject({ priority: "none", version: 1 });
  });
});

async function createList(actor: AuthenticatedActor, name: string) {
  return (
    await application.lists.createRegularList(actor, randomUUID(), {
      name,
      colorToken: "slate",
      folderId: null,
      placement: { kind: "end" },
    })
  ).value;
}

async function createTask(actor: AuthenticatedActor, listId: string, title: string) {
  return (
    await application.tasks.createTask(actor, randomUUID(), {
      title,
      descriptionMd: "",
      priority: "none",
      listId,
      sectionId: null,
      parentTaskId: null,
      placement: { kind: "end" },
    })
  ).value;
}

async function createScheduled(actor: AuthenticatedActor, listId: string, title: string, startAt: string) {
  const task = await createTask(actor, listId, title);
  const endAt = new Date(new Date(startAt).getTime() + 30 * 60_000).toISOString();
  const scheduled = await application.schedules.setSchedule(actor, task.id, {
    expectedVersion: 1,
    schedule: { kind: "timed", startAt, endAt, timezone: "UTC" },
  });
  return { ...task, version: scheduled.task.version };
}

function dailyDefinition() {
  return { preset: { kind: "daily" as const, interval: 1 }, end: { kind: "never" as const } };
}

async function storedTask(userId: string, taskId: string) {
  const result = await pool.query(`select * from tasks where user_id = $1 and id = $2`, [userId, taskId]);
  return result.rows[0] as Record<string, unknown> | undefined;
}

async function waitForBlockedLock(databasePool: Pool, applicationName: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await databasePool.query<{ count: number }>(
      `select count(*)::int as count
         from pg_stat_activity
        where application_name = $1 and wait_event_type = 'Lock'`,
      [applicationName],
    );
    if ((result.rows[0]?.count ?? 0) >= 1) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for the planner transaction to reach the recurrence lock.");
}

async function storedSchedule(userId: string, taskId: string) {
  const result = await pool.query(`select * from task_schedules where user_id = $1 and task_id = $2`, [
    userId,
    taskId,
  ]);
  return result.rows[0] as Record<string, unknown> | undefined;
}

async function activeInboxId(userId: string): Promise<string> {
  const result = await pool.query(
    `select id from task_lists where user_id = $1 and kind = 'inbox' and deleted_at is null`,
    [userId],
  );
  const id = result.rows[0]?.id as string | undefined;
  if (!id) throw new Error("Test owner has no Inbox.");
  return id;
}
