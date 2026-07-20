import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createInboxUseCases } from "../../modules/tasks/application/inbox.ts";
import { createTasksApplication } from "../../modules/tasks/application/tasks-application.ts";
import type { AuthenticatedActor } from "../../shared/auth/actor.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";
import type { Clock } from "../../shared/time/clock.ts";

import { createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("p2_task_recurrence_lifecycle");
let currentInstant = new Date("2026-07-19T10:00:00.000Z");
const clock: Clock = { now: () => new Date(currentInstant) };

let pool: Pool;
let database: Database;
let owner: AuthenticatedActor;
let stranger: AuthenticatedActor;
let application: ReturnType<typeof createTasksApplication>;

describe("P2 recurring task lifecycle integration", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema });
    owner = { userId: await insertUser(pool, "p2-recurrence-lifecycle-owner") };
    stranger = { userId: await insertUser(pool, "p2-recurrence-lifecycle-stranger") };
    const inboxes = createInboxUseCases({ database, clock });
    await inboxes.ensureInbox(owner.userId);
    await inboxes.ensureInbox(stranger.userId);
    application = createTasksApplication({ database, clock, taskSchedules: schema.taskSchedules });
  });

  afterAll(async () => fixture.teardown());

  it("protects active series and advances dormant cutovers without extra task versions", async () => {
    const list = (
      await application.lists.createRegularList(owner, randomUUID(), {
        name: "Recurring lifecycle",
        colorToken: "slate",
        folderId: null,
        placement: { kind: "end" },
      })
    ).value;
    const task = (
      await application.tasks.createTask(owner, randomUUID(), {
        title: "Daily review",
        descriptionMd: "",
        priority: "none",
        listId: list.id,
        sectionId: null,
        parentTaskId: null,
        placement: { kind: "end" },
      })
    ).value;

    await database.insert(schema.taskSchedules).values({
      userId: owner.userId,
      taskId: task.id,
      kind: "all_day",
      startDate: "2026-07-10",
      endDate: "2026-07-11",
      createdAt: currentInstant,
      updatedAt: currentInstant,
    });
    await database.insert(schema.taskRecurrences).values({
      userId: owner.userId,
      taskId: task.id,
      rrule: "FREQ=DAILY;INTERVAL=1",
      timezone: "Asia/Singapore",
      generationMode: "schedule",
      projectionStartDate: "2026-07-10",
      createdAt: currentInstant,
      updatedAt: currentInstant,
    });

    await expect(
      application.tasks.transitionTaskStatus(stranger, task.id, {
        expectedVersion: 1,
        status: "completed",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      application.tasks.transitionTaskStatus(owner, task.id, {
        expectedVersion: 1,
        status: "completed",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 1 });

    await expect(
      application.tasks.transitionTaskStatus(owner, task.id, {
        expectedVersion: 1,
        status: "cancelled",
      }),
    ).resolves.toMatchObject({ status: "cancelled", version: 2 });
    expect(await storedRecurrence(task.id)).toMatchObject({ projection_start_date: "2026-07-10" });

    currentInstant = new Date("2026-07-25T10:00:00.000Z");
    await expect(
      application.tasks.transitionTaskStatus(owner, task.id, {
        expectedVersion: 2,
        status: "open",
      }),
    ).resolves.toMatchObject({ status: "open", version: 3 });
    expect(await storedRecurrence(task.id)).toMatchObject({ projection_start_date: "2026-07-26" });

    currentInstant = new Date("2026-07-27T10:00:00.000Z");
    await expect(application.tasks.deleteTask(owner, task.id, { expectedVersion: 3 })).resolves.toMatchObject(
      { deletedAt: currentInstant.toISOString(), version: 4 },
    );
    expect(await storedRecurrence(task.id)).toMatchObject({ projection_start_date: "2026-07-26" });

    currentInstant = new Date("2026-07-30T10:00:00.000Z");
    await expect(
      application.tasks.restoreTask(owner, task.id, { expectedVersion: 4 }),
    ).resolves.toMatchObject({ deletedAt: null, version: 5 });
    expect(await storedRecurrence(task.id)).toMatchObject({ projection_start_date: "2026-07-31" });

    await database
      .update(schema.taskRecurrences)
      .set({ projectionEndDate: "2026-07-31", updatedAt: currentInstant })
      .where(
        and(eq(schema.taskRecurrences.userId, owner.userId), eq(schema.taskRecurrences.taskId, task.id)),
      );
    await expect(
      application.tasks.transitionTaskStatus(owner, task.id, {
        expectedVersion: 5,
        status: "completed",
      }),
    ).resolves.toMatchObject({ status: "completed", version: 6 });
    await expect(
      application.tasks.transitionTaskStatus(owner, task.id, {
        expectedVersion: 6,
        status: "open",
      }),
    ).resolves.toMatchObject({ status: "open", version: 7 });
    expect(await storedRecurrence(task.id)).toMatchObject({
      projection_start_date: "2026-07-31",
      projection_end_date: "2026-07-31",
    });
  });
});

async function storedRecurrence(taskId: string) {
  const result = await pool.query(
    `select projection_start_date::text as projection_start_date,
            projection_end_date::text as projection_end_date
       from task_recurrences
      where user_id = $1 and task_id = $2`,
    [owner.userId, taskId],
  );
  return result.rows[0] ?? null;
}
