import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTaskScheduleApplication } from "../../modules/tasks/application/schedule-application.ts";
import { createTaskSnapshotReader } from "../../modules/tasks/application/task-snapshot-reader.ts";
import { createTasksApplication } from "../../modules/tasks/application/tasks-application.ts";
import { createTaskSchema } from "../../modules/tasks/infrastructure/schema.ts";
import type { AuthenticatedActor } from "../../shared/auth/actor.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";
import type { Clock } from "../../shared/time/clock.ts";

import { createWp02SchemaFixture, expectPostgresError, insertUser } from "./wp02-schema-support.ts";

const now = new Date("2026-07-19T01:00:00.000Z");
const clock: Clock = { now: () => new Date(now) };
const fixture = createWp02SchemaFixture("task_schedule");
const taskSchedules = createTaskSchema(() => schema.user.id).taskSchedules;

let pool: Pool;
let database: Database;
let ownerA: AuthenticatedActor;
let ownerB: AuthenticatedActor;
let tasks: ReturnType<typeof createTasksApplication>;
let schedules: ReturnType<typeof createTaskScheduleApplication>;

describe("task schedule PostgreSQL integration", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema });
    ownerA = { userId: await insertUser(pool, "schedule-owner-a") };
    ownerB = { userId: await insertUser(pool, "schedule-owner-b") };
    tasks = createTasksApplication({ database, clock });
    schedules = createTaskScheduleApplication({ database, clock, taskSchedules });
  });

  afterAll(async () => fixture.teardown());

  it("sets and clears under ownership and CAS with one task-version increment", async () => {
    const listA = await createList(ownerA, "Schedule owner A");
    const task = await createTask(ownerA, listA.id, "Plan the demo");

    const set = await schedules.setSchedule(ownerA, task.id, {
      expectedVersion: 1,
      schedule: {
        kind: "timed",
        startAt: "2026-07-20T09:00:00+08:00",
        endAt: "2026-07-20T10:00:00+08:00",
        timezone: "Asia/Singapore",
      },
    });
    expect(set).toMatchObject({
      task: { id: task.id, version: 2 },
      schedule: {
        taskId: task.id,
        kind: "timed",
        startAt: "2026-07-20T01:00:00.000Z",
        endAt: "2026-07-20T02:00:00.000Z",
        timezone: "Asia/Singapore",
      },
    });
    expect(await storedTaskVersion(ownerA.userId, task.id)).toBe(2);

    await expect(
      schedules.setSchedule(ownerA, task.id, {
        expectedVersion: 1,
        schedule: { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-21" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 2 });
    await expect(
      schedules.setSchedule(ownerB, task.id, {
        expectedVersion: 2,
        schedule: { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-21" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await storedTaskVersion(ownerA.userId, task.id)).toBe(2);

    await expect(schedules.clearSchedule(ownerA, task.id, { expectedVersion: 2 })).resolves.toEqual({
      task: { id: task.id, version: 3 },
      schedule: null,
    });
    expect(await storedTaskVersion(ownerA.userId, task.id)).toBe(3);
    expect(await storedSchedule(ownerA.userId, task.id)).toBeNull();
    await expect(schedules.clearSchedule(ownerA, task.id, { expectedVersion: 3 })).rejects.toMatchObject({
      code: "CONFLICT",
      currentVersion: 3,
    });
  });

  it("enforces exact all-day/timed shapes, bounds, and tenant-leading ownership in PostgreSQL", async () => {
    const listA = await createList(ownerA, "Schedule constraints A");
    const listB = await createList(ownerB, "Schedule constraints B");
    const taskA = await createTask(ownerA, listA.id, "Constraint target");
    await createTask(ownerB, listB.id, "Other owner target");

    await expectPostgresError(
      pool.query(
        `insert into task_schedules
          (user_id, task_id, kind, start_date, end_date, created_at, updated_at)
         values ($1, $2, 'all_day', '2026-07-19', '2026-07-19', $3, $3)`,
        [ownerA.userId, taskA.id, now],
      ),
      "23514",
    );
    await expectPostgresError(
      pool.query(
        `insert into task_schedules
          (user_id, task_id, kind, start_at, end_at, timezone, created_at, updated_at)
         values ($1, $2, 'timed', '2026-07-19T10:00:00Z', '2026-07-19T09:00:00Z', 'UTC', $3, $3)`,
        [ownerA.userId, taskA.id, now],
      ),
      "23514",
    );
    await expectPostgresError(
      pool.query(
        `insert into task_schedules
          (user_id, task_id, kind, start_date, end_date, start_at, end_at, timezone, created_at, updated_at)
         values ($1, $2, 'all_day', '2026-07-19', '2026-07-20', $3, $3, 'UTC', $3, $3)`,
        [ownerA.userId, taskA.id, now],
      ),
      "23514",
    );
    await expectPostgresError(
      pool.query(
        `insert into task_schedules
          (user_id, task_id, kind, start_date, end_date, created_at, updated_at)
         values ($1, $2, 'all_day', '2026-07-19', '2026-07-20', $3, $3)`,
        [ownerB.userId, taskA.id, now],
      ),
      "23503",
    );

    await expect(
      schedules.setSchedule(ownerA, taskA.id, {
        expectedVersion: 1,
        schedule: {
          kind: "timed",
          startAt: "2026-07-18T09:00:00Z",
          endAt: "2026-07-18T09:00:00Z",
          timezone: "UTC",
        },
      }),
    ).resolves.toMatchObject({ task: { version: 2 }, schedule: { kind: "timed" } });
  });

  it("returns only half-open range overlaps, including timed points inside the instant range", async () => {
    const list = await createList(ownerA, "Schedule range");
    const cases = [
      ["ends-at-start", "2026-07-19T08:00:00Z", "2026-07-19T09:00:00Z", false],
      ["point-at-start", "2026-07-19T09:00:00Z", "2026-07-19T09:00:00Z", true],
      ["inside", "2026-07-19T09:30:00Z", "2026-07-19T10:30:00Z", true],
      ["point-at-end", "2026-07-19T10:00:00Z", "2026-07-19T10:00:00Z", false],
    ] as const;
    const expectedTimedIds = new Set<string>();
    for (const [title, startAt, endAt, expected] of cases) {
      const task = await createTask(ownerA, list.id, title);
      await schedules.setSchedule(ownerA, task.id, {
        expectedVersion: 1,
        schedule: { kind: "timed", startAt, endAt, timezone: "UTC" },
      });
      if (expected) expectedTimedIds.add(task.id);
    }

    const allDayCases = [
      ["all-day-ends-at-start", "2026-07-18", "2026-07-19", false],
      ["all-day-inside", "2026-07-19", "2026-07-20", true],
      ["all-day-starts-at-end", "2026-07-20", "2026-07-21", false],
    ] as const;
    const expectedAllDayIds = new Set<string>();
    for (const [title, startDate, endDate, expected] of allDayCases) {
      const task = await createTask(ownerA, list.id, title);
      await schedules.setSchedule(ownerA, task.id, {
        expectedVersion: 1,
        schedule: { kind: "all_day", startDate, endDate },
      });
      if (expected) expectedAllDayIds.add(task.id);
    }

    const page = await schedules.listRange(ownerA, {
      rangeStartDate: "2026-07-19",
      rangeEndDate: "2026-07-20",
      rangeStartAt: "2026-07-19T09:00:00Z",
      rangeEndAt: "2026-07-19T10:00:00Z",
      limit: 100,
    });
    const returned = new Set(page.items.map(({ task }) => task.id));
    expect(returned).toEqual(new Set([...expectedTimedIds, ...expectedAllDayIds]));
    expect(page.truncated).toBe(false);
  });

  it("loads selected open unscheduled snapshots without cross-user or lifecycle leakage", async () => {
    const listA = await createList(ownerA, "Snapshot owner A");
    const listB = await createList(ownerB, "Snapshot owner B");
    const first = await createTask(ownerA, listA.id, "First selected");
    const second = await createTask(ownerA, listA.id, "Second selected");
    const scheduled = await createTask(ownerA, listA.id, "Already scheduled");
    const completed = await createTask(ownerA, listA.id, "Already completed");
    const foreign = await createTask(ownerB, listB.id, "Private task");
    await schedules.setSchedule(ownerA, scheduled.id, {
      expectedVersion: 1,
      schedule: { kind: "all_day", startDate: "2026-07-19", endDate: "2026-07-20" },
    });
    await tasks.tasks.transitionTaskStatus(ownerA, completed.id, {
      expectedVersion: 1,
      status: "completed",
    });

    const reader = createTaskSnapshotReader({ database, taskSchedules });
    await expect(reader.loadOpenUnscheduled(ownerA, [second.id, first.id])).resolves.toEqual([
      expect.objectContaining({ id: second.id, title: "Second selected", version: 1 }),
      expect.objectContaining({ id: first.id, title: "First selected", version: 1 }),
    ]);
    for (const inaccessible of [scheduled.id, completed.id, foreign.id]) {
      await expect(reader.loadOpenUnscheduled(ownerA, [inaccessible])).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    }
  });
});

async function createList(actor: AuthenticatedActor, name: string) {
  return (
    await tasks.lists.createRegularList(actor, randomUUID(), {
      name,
      colorToken: "slate",
      folderId: null,
      placement: { kind: "end" },
    })
  ).value;
}

async function createTask(actor: AuthenticatedActor, listId: string, title: string) {
  return (
    await tasks.tasks.createTask(actor, randomUUID(), {
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

async function storedTaskVersion(userId: string, taskId: string): Promise<number | null> {
  const result = await pool.query(`select version from tasks where user_id = $1 and id = $2`, [
    userId,
    taskId,
  ]);
  return result.rows[0]?.version ?? null;
}

async function storedSchedule(userId: string, taskId: string) {
  const result = await pool.query(
    `select kind, start_date, end_date, start_at, end_at, timezone
       from task_schedules where user_id = $1 and task_id = $2`,
    [userId, taskId],
  );
  return result.rows[0] ?? null;
}
