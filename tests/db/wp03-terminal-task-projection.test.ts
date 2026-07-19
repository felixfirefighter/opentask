import { randomUUID } from "node:crypto";

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

const fixture = createWp02SchemaFixture("wp03_terminal_tasks");
let pool: Pool;
let database: Database;
let ownerA: AuthenticatedActor;
let ownerB: AuthenticatedActor;
let application: ReturnType<typeof createTasksApplication>;
let currentInstant = new Date("2026-07-19T08:00:00.000Z");
const clock: Clock = { now: () => new Date(currentInstant) };

describe("WP03 terminal task projection", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema });
    ownerA = { userId: await insertUser(pool, "wp03-terminal-owner-a") };
    ownerB = { userId: await insertUser(pool, "wp03-terminal-owner-b") };
    const inboxes = createInboxUseCases({ database, clock });
    await inboxes.ensureInbox(ownerA.userId);
    await inboxes.ensureInbox(ownerB.userId);
    application = createTasksApplication({ database, clock, taskSchedules: schema.taskSchedules });
  });

  afterAll(async () => fixture.teardown());

  it("pages each terminal status globally without leaking users, deleted rows, or deleted tags", async () => {
    const listA = await createList(ownerA, "Release");
    const otherListA = await createList(ownerA, "Personal");
    const listB = await createList(ownerB, "Private");
    const older = await createTask(ownerA, listA.id, "Older completed");
    const newer = await createTask(ownerA, otherListA.id, "Newer completed");
    const cancelled = await createTask(ownerA, listA.id, "Cancelled task");
    const open = await createTask(ownerA, listA.id, "Still open");
    const deleted = await createTask(ownerA, listA.id, "Deleted completed");
    const parent = await createTask(ownerA, listA.id, "Parent task");
    const child = await createTask(ownerA, listA.id, "Completed subtask", parent.id);
    const foreign = await createTask(ownerB, listB.id, "Foreign completed");

    const activeTag = await createTag(ownerA, "Launch", "coral");
    const deletedTag = await createTag(ownerA, "Old tag", "slate");
    const newerTagged = await application.tags.replaceTaskTags(ownerA, newer.id, {
      expectedVersion: newer.version,
      tagIds: [activeTag.id],
    });
    const olderTagged = await application.tags.replaceTaskTags(ownerA, older.id, {
      expectedVersion: older.version,
      tagIds: [deletedTag.id],
    });

    setNow("2026-07-19T09:00:00.000Z");
    await application.tasks.transitionTaskStatus(ownerA, older.id, {
      expectedVersion: olderTagged.task.version,
      status: "completed",
    });
    setNow("2026-07-19T10:00:00.000Z");
    await application.tasks.transitionTaskStatus(ownerA, cancelled.id, {
      expectedVersion: cancelled.version,
      status: "cancelled",
    });
    setNow("2026-07-19T11:00:00.000Z");
    await application.tasks.transitionTaskStatus(ownerA, newer.id, {
      expectedVersion: newerTagged.task.version,
      status: "completed",
    });
    setNow("2026-07-19T12:00:00.000Z");
    await application.tasks.transitionTaskStatus(ownerB, foreign.id, {
      expectedVersion: foreign.version,
      status: "completed",
    });
    setNow("2026-07-19T13:00:00.000Z");
    const deletedCompleted = await application.tasks.transitionTaskStatus(ownerA, deleted.id, {
      expectedVersion: deleted.version,
      status: "completed",
    });
    await application.tasks.deleteTask(ownerA, deleted.id, { expectedVersion: deletedCompleted.version });
    setNow("2026-07-19T14:00:00.000Z");
    await application.tasks.transitionTaskStatus(ownerA, child.id, {
      expectedVersion: child.version,
      status: "completed",
    });
    await application.tags.deleteTag(ownerA, deletedTag.id, { expectedVersion: deletedTag.version });

    const firstPage = await application.tasks.listTerminalTasks(ownerA, {
      status: "completed",
      limit: 2,
    });
    expect(firstPage.items).toEqual([
      expect.objectContaining({ id: child.id, parentTaskId: parent.id, tags: [] }),
      expect.objectContaining({
        id: newer.id,
        listId: otherListA.id,
        tags: [expect.objectContaining({ id: activeTag.id, name: "Launch" })],
      }),
    ]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const secondPage = await application.tasks.listTerminalTasks(ownerA, {
      status: "completed",
      cursor: firstPage.nextCursor ?? undefined,
      limit: 2,
    });
    expect(secondPage).toMatchObject({
      items: [expect.objectContaining({ id: older.id, tags: [] })],
      nextCursor: null,
    });
    expect([...firstPage.items, ...secondPage.items].map(({ id }) => id)).not.toContain(deleted.id);
    expect([...firstPage.items, ...secondPage.items].map(({ id }) => id)).not.toContain(open.id);
    expect([...firstPage.items, ...secondPage.items].map(({ id }) => id)).not.toContain(foreign.id);
    expect(firstPage.items[0]).not.toHaveProperty("userId");
    expect(firstPage.items[1]?.tags[0]).not.toHaveProperty("userId");

    await expect(
      application.tasks.listTerminalTasks(ownerA, { status: "cancelled", limit: 50 }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: cancelled.id, status: "cancelled" })],
      nextCursor: null,
    });
    await expect(
      application.tasks.listTerminalTasks(ownerB, { status: "completed", limit: 50 }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: foreign.id })],
      nextCursor: null,
    });
    await expect(
      application.tasks.listTerminalTasks(ownerA, {
        status: "cancelled",
        cursor: firstPage.nextCursor ?? undefined,
        limit: 2,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("uses the existing actor/status timestamp index for the bounded projection", async () => {
    await pool.query("set enable_seqscan = off");
    const result = await pool.query<{ "QUERY PLAN": string }>(
      `explain (costs off)
       select * from tasks
       where user_id = $1 and status = 'completed' and deleted_at is null
       order by status_changed_at desc, id desc
       limit 51`,
      [ownerA.userId],
    );
    expect(result.rows.map((row) => row["QUERY PLAN"]).join("\n")).toContain("tasks_user_status_changed_idx");
  });
});

function setNow(value: string): void {
  currentInstant = new Date(value);
}

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

async function createTask(
  actor: AuthenticatedActor,
  listId: string,
  title: string,
  parentTaskId: string | null = null,
) {
  return (
    await application.tasks.createTask(actor, randomUUID(), {
      title,
      listId,
      sectionId: null,
      parentTaskId,
      descriptionMd: "",
      priority: "none",
      placement: { kind: "end" },
    })
  ).value;
}

async function createTag(actor: AuthenticatedActor, name: string, colorToken: "coral" | "slate") {
  return (
    await application.tags.createTag(actor, randomUUID(), {
      name,
      colorToken,
    })
  ).value;
}
