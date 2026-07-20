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

  it("loads only owned open snapshots and canonical schedules under row lock", async () => {
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
        { query: range, excludedTaskIds: [] },
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
