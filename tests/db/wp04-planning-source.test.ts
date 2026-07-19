import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTasksApplication } from "../../modules/tasks/application/tasks-application.ts";
import type { AuthenticatedActor } from "../../shared/auth/actor.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";
import type { Clock } from "../../shared/time/clock.ts";

import { createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const clock: Clock = { now: () => new Date("2026-07-19T01:00:00.000Z") };
const fixture = createWp02SchemaFixture("planning_source");

let pool: Pool;
let database: Database;
let ownerA: AuthenticatedActor;
let ownerB: AuthenticatedActor;
let application: ReturnType<typeof createTasksApplication>;

describe("planning source PostgreSQL integration", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema });
    ownerA = { userId: await insertUser(pool, "planning-source-owner-a") };
    ownerB = { userId: await insertUser(pool, "planning-source-owner-b") };
    application = createTasksApplication({ database, clock, taskSchedules: schema.taskSchedules });
  });

  afterAll(async () => fixture.teardown());

  it("projects actor-scoped scheduled-through, finite-range, and all-open rows", async () => {
    const listA = await createList(ownerA, "Owner A planning");
    const listB = await createList(ownerB, "Owner B planning");
    const overdue = await createScheduled(ownerA, listA.id, "Overdue", {
      kind: "all_day",
      startDate: "2026-07-17",
      endDate: "2026-07-18",
    });
    const today = await createScheduled(ownerA, listA.id, "Today", {
      kind: "timed",
      startAt: "2026-07-19T09:00:00Z",
      endAt: "2026-07-19T10:00:00Z",
      timezone: "UTC",
    });
    const future = await createScheduled(ownerA, listA.id, "Future", {
      kind: "all_day",
      startDate: "2026-07-21",
      endDate: "2026-07-22",
    });
    const unscheduled = await createTask(ownerA, listA.id, "Unscheduled");
    const completed = await createScheduled(ownerA, listA.id, "Completed", {
      kind: "all_day",
      startDate: "2026-07-19",
      endDate: "2026-07-20",
    });
    await application.tasks.transitionTaskStatus(ownerA, completed.id, {
      expectedVersion: 2,
      status: "completed",
    });
    await createScheduled(ownerB, listB.id, "Private", {
      kind: "all_day",
      startDate: "2026-07-19",
      endDate: "2026-07-20",
    });

    const through = await application.planningSource.readOpenTasks(ownerA, {
      kind: "scheduled_through",
      exclusiveEndDate: "2026-07-20",
      exclusiveEndAt: "2026-07-20T00:00:00Z",
      limit: 100,
    });
    expect(new Set(through.items.map(({ task }) => task.id))).toEqual(new Set([overdue.id, today.id]));
    expect(through.truncated).toBe(false);

    const range = await application.planningSource.readOpenTasks(ownerA, {
      kind: "scheduled_range",
      rangeStartDate: "2026-07-19",
      rangeEndDate: "2026-07-20",
      rangeStartAt: "2026-07-19T00:00:00Z",
      rangeEndAt: "2026-07-20T00:00:00Z",
      limit: 100,
    });
    expect(range.items.map(({ task }) => task.id)).toEqual([today.id]);

    const allOpen = await application.planningSource.readOpenTasks(ownerA, {
      kind: "all_open",
      limit: 100,
    });
    expect(new Set(allOpen.items.map(({ task }) => task.id))).toEqual(
      new Set([overdue.id, today.id, future.id, unscheduled.id]),
    );
    expect(allOpen.items.find(({ task }) => task.id === unscheduled.id)?.schedule).toBeNull();

    const truncated = await application.planningSource.readOpenTasks(ownerA, {
      kind: "all_open",
      limit: 1,
    });
    expect(truncated.items).toHaveLength(1);
    expect(truncated.truncated).toBe(true);
    await expect(
      application.planningSource.readOpenTasks(ownerB, {
        kind: "scheduled_through",
        exclusiveEndDate: "2026-07-20",
        exclusiveEndAt: "2026-07-20T00:00:00Z",
        limit: 100,
      }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ task: expect.objectContaining({ title: "Private" }) })],
    });
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

async function createScheduled(
  actor: AuthenticatedActor,
  listId: string,
  title: string,
  schedule:
    | { kind: "all_day"; startDate: string; endDate: string }
    | { kind: "timed"; startAt: string; endAt: string; timezone: string },
) {
  const task = await createTask(actor, listId, title);
  await application.schedules.setSchedule(actor, task.id, { expectedVersion: 1, schedule });
  return task;
}
