import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createInboxUseCases } from "../../modules/tasks/application/inbox.ts";
import { createTaskLifecycleLocks } from "../../modules/tasks/application/task-lifecycle-locks.ts";
import { createTasksApplication } from "../../modules/tasks/application/tasks-application.ts";
import { createSectionRepository } from "../../modules/tasks/infrastructure/section-repository.ts";
import { createTaskRepository } from "../../modules/tasks/infrastructure/task-repository.ts";
import { createTaskListRepository } from "../../modules/tasks/infrastructure/task-list-repository.ts";
import type { AuthenticatedActor } from "../../shared/auth/actor.ts";
import { getTestDatabaseUrl } from "../../shared/config/environment.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";
import type { Clock } from "../../shared/time/clock.ts";

import { createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("task_lifecycle");
let currentInstant = new Date("2026-07-19T10:00:00.000Z");
const testClock: Clock = { now: () => new Date(currentInstant) };

let pool: Pool;
let database: Database;
let ownerA: AuthenticatedActor;
let ownerB: AuthenticatedActor;
let application: ReturnType<typeof createTasksApplication>;

describe("WP02 task lifecycle application integration", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema });
    ownerA = { userId: await insertUser(pool, "lifecycle-owner-a") };
    ownerB = { userId: await insertUser(pool, "lifecycle-owner-b") };
    const inboxes = createInboxUseCases({ database, clock: testClock });
    await inboxes.ensureInbox(ownerA.userId);
    await inboxes.ensureInbox(ownerB.userId);
    application = createTasksApplication({ database, clock: testClock, taskSchedules: schema.taskSchedules });
  });

  afterAll(async () => fixture.teardown());

  it("enforces every status transition, no-op rejection, ownership, and stale CAS", async () => {
    setNow("2026-07-19T10:10:00.000Z");
    const list = await createList(ownerA, "Status tasks");
    const task = (await createTask(ownerA, { listId: list.id, title: "Lifecycle" })).value;
    const initial = await storedTask(task.id);

    await expect(
      application.tasks.transitionTaskStatus(ownerB, task.id, { expectedVersion: 1, status: "completed" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      application.tasks.transitionTaskStatus(ownerA, task.id, { expectedVersion: 1, status: "open" }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 1 });
    expect(await storedTask(task.id)).toEqual(initial);

    setNow("2026-07-19T10:11:00.000Z");
    await expect(
      application.tasks.transitionTaskStatus(ownerA, task.id, {
        expectedVersion: 1,
        status: "completed",
      }),
    ).resolves.toMatchObject({ status: "completed", version: 2, statusChangedAt: currentIso() });
    const completed = await storedTask(task.id);
    await expect(
      application.tasks.transitionTaskStatus(ownerA, task.id, {
        expectedVersion: 2,
        status: "completed",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 2 });
    await expect(
      application.tasks.transitionTaskStatus(ownerA, task.id, {
        expectedVersion: 2,
        status: "cancelled",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 2 });
    expect(await storedTask(task.id)).toEqual(completed);

    setNow("2026-07-19T10:12:00.000Z");
    await expect(
      application.tasks.transitionTaskStatus(ownerA, task.id, { expectedVersion: 2, status: "open" }),
    ).resolves.toMatchObject({ status: "open", version: 3, statusChangedAt: currentIso() });
    setNow("2026-07-19T10:13:00.000Z");
    await expect(
      application.tasks.transitionTaskStatus(ownerA, task.id, {
        expectedVersion: 3,
        status: "cancelled",
      }),
    ).resolves.toMatchObject({ status: "cancelled", version: 4, statusChangedAt: currentIso() });
    const cancelled = await storedTask(task.id);
    await expect(
      application.tasks.transitionTaskStatus(ownerA, task.id, {
        expectedVersion: 4,
        status: "cancelled",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 4 });
    await expect(
      application.tasks.transitionTaskStatus(ownerA, task.id, {
        expectedVersion: 4,
        status: "completed",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 4 });
    expect(await storedTask(task.id)).toEqual(cancelled);

    setNow("2026-07-19T10:14:00.000Z");
    await expect(
      application.tasks.transitionTaskStatus(ownerA, task.id, { expectedVersion: 4, status: "open" }),
    ).resolves.toMatchObject({ status: "open", version: 5, statusChangedAt: currentIso() });
    await expect(
      application.tasks.transitionTaskStatus(ownerA, task.id, {
        expectedVersion: 4,
        status: "completed",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 5 });
  });

  it("moves root trees across lists, including deleted children, then reorders with CAS", async () => {
    setNow("2026-07-19T11:00:00.000Z");
    const source = await createList(ownerA, "Move source");
    const destination = await createList(ownerA, "Move destination");
    const sourceSection = await createSection(ownerA, source.id, "Source section");
    const destinationSection = await createSection(ownerA, destination.id, "Destination section");
    const root = (
      await createTask(ownerA, {
        listId: source.id,
        sectionId: sourceSection.id,
        title: "Move root",
      })
    ).value;
    const activeChild = (
      await createTask(ownerA, {
        listId: source.id,
        sectionId: sourceSection.id,
        parentTaskId: root.id,
        title: "Active child",
      })
    ).value;
    const deletedChild = (
      await createTask(ownerA, {
        listId: source.id,
        sectionId: sourceSection.id,
        parentTaskId: root.id,
        title: "Deleted child",
      })
    ).value;
    const anchor = (
      await createTask(ownerA, {
        listId: destination.id,
        sectionId: destinationSection.id,
        title: "Destination anchor",
      })
    ).value;
    await application.tasks.deleteTask(ownerA, deletedChild.id, { expectedVersion: 1 });

    const beforeRejectedMove = await storedTask(root.id);
    await expect(
      application.tasks.moveTask(ownerB, root.id, {
        expectedVersion: 1,
        listId: destination.id,
        sectionId: destinationSection.id,
        parentTaskId: null,
        placement: { kind: "end" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      application.tasks.moveTask(ownerA, root.id, {
        expectedVersion: 1,
        listId: destination.id,
        sectionId: sourceSection.id,
        parentTaskId: null,
        placement: { kind: "end" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await storedTask(root.id)).toEqual(beforeRejectedMove);

    setNow("2026-07-19T11:01:00.000Z");
    await expect(
      application.tasks.moveTask(ownerA, root.id, {
        expectedVersion: 1,
        listId: destination.id,
        sectionId: destinationSection.id,
        parentTaskId: null,
        placement: { kind: "end" },
      }),
    ).resolves.toMatchObject({
      id: root.id,
      listId: destination.id,
      sectionId: destinationSection.id,
      version: 2,
    });
    expect(await storedTask(activeChild.id)).toMatchObject({
      list_id: destination.id,
      section_id: null,
      parent_task_id: root.id,
      deleted_at: null,
      version: 2,
    });
    expect(await storedTask(deletedChild.id)).toMatchObject({
      list_id: destination.id,
      section_id: null,
      parent_task_id: root.id,
      deleted_at: expect.any(Date),
      version: 3,
    });

    setNow("2026-07-19T11:02:00.000Z");
    const positioned = await application.tasks.positionTask(ownerA, root.id, {
      expectedVersion: 2,
      placement: { kind: "before", anchorId: anchor.id },
    });
    expect(positioned.version).toBe(3);
    const firstDestinationPage = await application.tasks.listTasks(ownerA, {
      listId: destination.id,
      sectionId: destinationSection.id,
      parentTaskId: null,
      status: "open",
      limit: 1,
    });
    expect(firstDestinationPage).toMatchObject({
      items: [expect.objectContaining({ id: root.id })],
      nextCursor: expect.any(String),
    });
    const secondDestinationPage = await application.tasks.listTasks(ownerA, {
      listId: destination.id,
      sectionId: destinationSection.id,
      parentTaskId: null,
      status: "open",
      cursor: firstDestinationPage.nextCursor ?? undefined,
      limit: 1,
    });
    expect(secondDestinationPage).toMatchObject({
      items: [expect.objectContaining({ id: anchor.id })],
      nextCursor: null,
    });
    await expect(
      application.tasks.positionTask(ownerA, root.id, {
        expectedVersion: 2,
        placement: { kind: "after", anchorId: anchor.id },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 3 });
  });

  it("returns a stale conflict after a container lock waits on an atomic list move", async () => {
    setNow("2026-07-19T11:30:00.000Z");
    const source = await createList(ownerA, "Container race source");
    const destination = await createList(ownerA, "Container race destination");
    const task = (await createTask(ownerA, { listId: source.id, title: "Container race" })).value;
    const blocker = await pool.connect();
    const racePool = new Pool({
      connectionString: getTestDatabaseUrl(),
      max: 1,
      application_name: "opentask-wp02-lifecycle-race",
      options: `-c search_path=${fixture.schemaName}`,
    });
    const raceDatabase = drizzle(racePool, { schema });
    const raceTasks = createTaskRepository(raceDatabase);
    const raceLists = createTaskListRepository(raceDatabase);
    let markListLockAttempted!: () => void;
    const listLockAttempted = new Promise<void>((resolve) => {
      markListLockAttempted = resolve;
    });
    const lifecycleLocks = createTaskLifecycleLocks({
      tasks: raceTasks,
      lists: {
        ...raceLists,
        lockById(...args: Parameters<typeof raceLists.lockById>) {
          markListLockAttempted();
          return raceLists.lockById(...args);
        },
      },
      sections: createSectionRepository(raceDatabase),
    });
    let transactionOpen = false;

    try {
      await racePool.query("select 1");
      const observed = await raceTasks.findById(ownerA.userId, task.id, "any");
      if (!observed) throw new Error("The race fixture task was not found.");
      await blocker.query("begin");
      transactionOpen = true;
      await blocker.query(`select id from task_lists where user_id = $1 and id = $2 for update`, [
        ownerA.userId,
        source.id,
      ]);
      const pending = raceDatabase
        .transaction((transaction) =>
          lifecycleLocks.lockContainers(ownerA.userId, [observed], observed, transaction),
        )
        .then(
          (value) => ({ status: "fulfilled" as const, value }),
          (error: unknown) => ({ status: "rejected" as const, error }),
        );

      await listLockAttempted;
      await blocker.query(
        `update tasks
            set list_id = $1, section_id = null, version = version + 1, updated_at = $2
          where user_id = $3 and id = $4`,
        [destination.id, currentInstant, ownerA.userId, task.id],
      );
      await blocker.query(
        `update task_lists
            set deleted_at = $1, version = version + 1, updated_at = $1
          where user_id = $2 and id = $3`,
        [currentInstant, ownerA.userId, source.id],
      );
      await blocker.query("commit");
      transactionOpen = false;

      const outcome = await pending;
      if (outcome.status === "fulfilled") {
        throw new Error("The stale container lock unexpectedly succeeded.");
      }
      expect(outcome.error).toMatchObject({ code: "CONFLICT", currentVersion: 2 });
      expect(await storedTask(task.id)).toMatchObject({ list_id: destination.id, version: 2 });
    } finally {
      if (transactionOpen) await blocker.query("rollback");
      blocker.release();
      await racePool.end();
    }
  });

  it("avoids same-clock deletion collisions and restores only children from the root event", async () => {
    setNow("2026-07-19T12:00:00.000Z");
    const list = await createList(ownerA, "Restore event tasks");
    const root = (await createTask(ownerA, { listId: list.id, title: "Event root" })).value;
    const activeChild = (
      await createTask(ownerA, { listId: list.id, parentTaskId: root.id, title: "Event child" })
    ).value;
    const oldChild = (
      await createTask(ownerA, { listId: list.id, parentTaskId: root.id, title: "Older deletion" })
    ).value;

    setNow("2026-07-19T12:01:00.000Z");
    await application.tasks.deleteTask(ownerA, oldChild.id, { expectedVersion: 1 });
    const olderDeletion = new Date(currentInstant);
    await application.tasks.deleteTask(ownerA, root.id, { expectedVersion: 1 });
    const treeDeletion = new Date(currentInstant.getTime() + 1);
    expect(treeDeletion).not.toEqual(olderDeletion);
    expect(await storedTask(root.id)).toMatchObject({ deleted_at: treeDeletion, version: 2 });
    expect(await storedTask(activeChild.id)).toMatchObject({ deleted_at: treeDeletion, version: 2 });
    expect(await storedTask(oldChild.id)).toMatchObject({ deleted_at: olderDeletion, version: 2 });

    await expect(
      application.tasks.restoreTask(ownerB, root.id, { expectedVersion: 2 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    setNow("2026-07-19T12:03:00.000Z");
    await expect(
      application.tasks.restoreTask(ownerA, root.id, { expectedVersion: 2 }),
    ).resolves.toMatchObject({ id: root.id, deletedAt: null, version: 3 });
    expect(await storedTask(activeChild.id)).toMatchObject({ deleted_at: null, version: 3 });
    expect(await storedTask(oldChild.id)).toMatchObject({ deleted_at: olderDeletion, version: 2 });
    const detail = await application.tasks.getTask(ownerA, root.id);
    expect(detail.subtasks.map(({ id }) => id)).toEqual([activeChild.id]);
  });

  it("rolls back restores when the saved list or parent is no longer active", async () => {
    setNow("2026-07-19T13:00:00.000Z");
    const deletedList = await createList(ownerA, "Deleted restore container");
    const strandedRoot = (await createTask(ownerA, { listId: deletedList.id, title: "Stranded root" })).value;
    await application.tasks.deleteTask(ownerA, strandedRoot.id, { expectedVersion: 1 });
    await application.lists.deleteRegularList(ownerA, deletedList.id, { expectedVersion: 1 });
    const strandedBeforeRestore = await storedTask(strandedRoot.id);
    await expect(
      application.tasks.restoreTask(ownerA, strandedRoot.id, { expectedVersion: 2 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await storedTask(strandedRoot.id)).toEqual(strandedBeforeRestore);

    const list = await createList(ownerA, "Deleted parent restore");
    const parent = (await createTask(ownerA, { listId: list.id, title: "Deleted parent" })).value;
    const child = (
      await createTask(ownerA, { listId: list.id, parentTaskId: parent.id, title: "Stranded child" })
    ).value;
    setNow("2026-07-19T13:01:00.000Z");
    await application.tasks.deleteTask(ownerA, child.id, { expectedVersion: 1 });
    setNow("2026-07-19T13:02:00.000Z");
    await application.tasks.deleteTask(ownerA, parent.id, { expectedVersion: 1 });
    const childBeforeRestore = await storedTask(child.id);
    await expect(
      application.tasks.restoreTask(ownerA, child.id, { expectedVersion: 2 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await storedTask(child.id)).toEqual(childBeforeRestore);
  });
});

function setNow(value: string) {
  currentInstant = new Date(value);
}

function currentIso() {
  return currentInstant.toISOString();
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

async function createSection(actor: AuthenticatedActor, listId: string, name: string) {
  return (
    await application.sections.createSection(actor, listId, randomUUID(), {
      name,
      placement: { kind: "end" },
    })
  ).value;
}

async function createTask(
  actor: AuthenticatedActor,
  input: {
    listId: string;
    sectionId?: string | null;
    parentTaskId?: string | null;
    title: string;
  },
) {
  return application.tasks.createTask(actor, randomUUID(), {
    title: input.title,
    descriptionMd: "",
    priority: "none",
    listId: input.listId,
    sectionId: input.sectionId ?? null,
    parentTaskId: input.parentTaskId ?? null,
    placement: { kind: "end" },
  });
}

async function storedTask(id: string) {
  const result = await pool.query(
    `select id, user_id, list_id, section_id, parent_task_id, status, rank, status_changed_at,
            version, created_at, updated_at, deleted_at
       from tasks where id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}
