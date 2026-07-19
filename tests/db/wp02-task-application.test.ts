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

const testInstant = new Date("2026-07-19T09:00:00.000Z");
const testClock: Clock = { now: () => new Date(testInstant) };
const fixture = createWp02SchemaFixture("task_application");

let pool: Pool;
let database: Database;
let ownerA: AuthenticatedActor;
let ownerB: AuthenticatedActor;
let application: ReturnType<typeof createTasksApplication>;

describe("WP02 task and checklist application integration", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema });
    ownerA = { userId: await insertUser(pool, "task-owner-a") };
    ownerB = { userId: await insertUser(pool, "task-owner-b") };
    const inboxes = createInboxUseCases({ database, clock: testClock });
    await inboxes.ensureInbox(ownerA.userId);
    await inboxes.ensureInbox(ownerB.userId);
    application = createTasksApplication({ database, clock: testClock, taskSchedules: schema.taskSchedules });
  });

  afterAll(async () => fixture.teardown());

  it("enforces idempotent task creation, ownership, placement, one-level parents, and CAS", async () => {
    const listA = await createList(ownerA, "Owner A tasks");
    const otherListA = await createList(ownerA, "Owner A other tasks");
    const listB = await createList(ownerB, "Owner B tasks");
    const sectionA = await createSection(ownerA, listA.id, "Now");
    const otherSectionA = await createSection(ownerA, otherListA.id, "Elsewhere");
    const sectionB = await createSection(ownerB, listB.id, "Private");
    const taskId = randomUUID();

    const created = await createTask(ownerA, {
      id: taskId,
      listId: listA.id,
      sectionId: sectionA.id,
      title: "Ship the release",
    });
    expect(created).toMatchObject({ created: true, value: { id: taskId, version: 1 } });
    await expect(
      createTask(ownerA, {
        id: taskId,
        listId: listA.id,
        sectionId: sectionA.id,
        title: "Ship the release",
        placement: { kind: "start" },
      }),
    ).resolves.toMatchObject({ created: false, value: { id: taskId, version: 1 } });
    await expect(
      createTask(ownerA, {
        id: taskId,
        listId: listA.id,
        sectionId: sectionA.id,
        title: "Changed replay",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(application.tasks.getTask(ownerB, taskId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      application.tasks.updateTask(ownerB, taskId, {
        expectedVersion: 1,
        patch: { title: "Guessed" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      application.tasks.updateTask(ownerA, taskId, {
        expectedVersion: 9,
        patch: { title: "Stale" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 1 });

    await expect(
      createTask(ownerA, { listId: listA.id, sectionId: otherSectionA.id, title: "Wrong section" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      createTask(ownerA, { listId: listA.id, sectionId: sectionB.id, title: "Foreign section" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const foreignParent = (await createTask(ownerB, { listId: listB.id, title: "Foreign parent" })).value;
    await expect(
      createTask(ownerA, { listId: listA.id, parentTaskId: foreignParent.id, title: "Foreign child" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const otherListParent = (await createTask(ownerA, { listId: otherListA.id, title: "Other-list parent" }))
      .value;
    await expect(
      createTask(ownerA, { listId: listA.id, parentTaskId: otherListParent.id, title: "Wrong-list child" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const child = (
      await createTask(ownerA, { listId: listA.id, parentTaskId: taskId, title: "Direct child" })
    ).value;
    expect(child).toMatchObject({ listId: listA.id, parentTaskId: taskId, version: 1 });
    await expect(
      createTask(ownerA, { listId: listA.id, parentTaskId: child.id, title: "Grandchild" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("keeps checklist items distinct from subtasks and isolated from task state", async () => {
    const list = await createList(ownerA, "Checklist tasks");
    const retainedTask = (await createTask(ownerA, { listId: list.id, title: "Retained checklist parent" }))
      .value;
    const retainedItemId = randomUUID();
    const retainedInput = { title: "Retained checklist item", placement: { kind: "end" as const } };
    await application.checklist.createChecklistItem(ownerA, retainedTask.id, retainedItemId, retainedInput);
    await application.tasks.deleteTask(ownerA, retainedTask.id, { expectedVersion: retainedTask.version });
    await expect(
      application.checklist.createChecklistItem(ownerA, retainedTask.id, retainedItemId, retainedInput),
    ).resolves.toMatchObject({ created: false, value: { id: retainedItemId, version: 1 } });

    const task = (await createTask(ownerA, { listId: list.id, title: "Prepare demo" })).value;
    const subtask = (
      await createTask(ownerA, { listId: list.id, parentTaskId: task.id, title: "Record video" })
    ).value;
    const firstItemId = randomUUID();
    const secondItemId = randomUUID();

    await expect(
      application.checklist.createChecklistItem(ownerA, task.id, firstItemId, {
        title: "Check audio",
        placement: { kind: "end" },
      }),
    ).resolves.toMatchObject({ created: true, value: { id: firstItemId, version: 1 } });
    await expect(
      application.checklist.createChecklistItem(ownerA, task.id, firstItemId, {
        title: "Check audio",
        placement: { kind: "start" },
      }),
    ).resolves.toMatchObject({ created: false, value: { id: firstItemId, version: 1 } });
    await expect(
      application.checklist.createChecklistItem(ownerA, task.id, firstItemId, {
        title: "Changed replay",
        placement: { kind: "end" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await application.checklist.createChecklistItem(ownerA, task.id, secondItemId, {
      title: "Check captions",
      placement: { kind: "end" },
    });

    const otherTask = (await createTask(ownerA, { listId: list.id, title: "Other task" })).value;
    const otherItemId = randomUUID();
    await application.checklist.createChecklistItem(ownerA, otherTask.id, otherItemId, {
      title: "Other item",
      placement: { kind: "end" },
    });
    await expect(
      application.checklist.updateChecklistItem(ownerB, task.id, firstItemId, {
        expectedVersion: 1,
        patch: { isCompleted: true },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      application.checklist.updateChecklistItem(ownerA, task.id, otherItemId, {
        expectedVersion: 1,
        patch: { isCompleted: true },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const positioned = await application.checklist.positionChecklistItem(ownerA, task.id, firstItemId, {
      expectedVersion: 1,
      placement: { kind: "after", anchorId: secondItemId },
    });
    expect(positioned.version).toBe(2);
    await expect(
      application.checklist.updateChecklistItem(ownerA, task.id, firstItemId, {
        expectedVersion: 1,
        patch: { isCompleted: true },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 2 });

    const taskBeforeCompletion = await storedTask(task.id);
    await application.checklist.updateChecklistItem(ownerA, task.id, firstItemId, {
      expectedVersion: 2,
      patch: { isCompleted: true },
    });
    await application.checklist.updateChecklistItem(ownerA, task.id, secondItemId, {
      expectedVersion: 1,
      patch: { title: "Check final captions", isCompleted: true },
    });
    const detail = await application.tasks.getTask(ownerA, task.id);
    expect(detail.subtasks).toEqual([expect.objectContaining({ id: subtask.id, parentTaskId: task.id })]);
    expect(detail.checklistItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: firstItemId, taskId: task.id, isCompleted: true }),
        expect.objectContaining({ id: secondItemId, taskId: task.id, isCompleted: true }),
      ]),
    );
    expect(detail).not.toHaveProperty("userId");
    expect(await storedTask(task.id)).toMatchObject({
      status: taskBeforeCompletion.status,
      version: taskBeforeCompletion.version,
    });

    await expect(
      application.checklist.deleteChecklistItem(ownerA, task.id, firstItemId, { expectedVersion: 3 }),
    ).resolves.toMatchObject({ id: firstItemId, version: 3 });
    expect(await storedChecklistItem(firstItemId)).toBeNull();
    expect(await storedTask(task.id)).toMatchObject({ status: "open", version: 1 });
    await expect(
      application.checklist.createChecklistItem(ownerA, task.id, firstItemId, {
        title: "Recreated after hard delete",
        placement: { kind: "end" },
      }),
    ).resolves.toMatchObject({ created: true, value: { id: firstItemId, version: 1 } });
  });

  it("pages and filters active tasks without leaking lists or mixing task hierarchies", async () => {
    const list = await createList(ownerA, "Paged tasks");
    const otherList = await createList(ownerA, "Other paged tasks");
    const section = await createSection(ownerA, list.id, "Focused");
    const rootA = (await createTask(ownerA, { listId: list.id, title: "Root A" })).value;
    const rootB = (await createTask(ownerA, { listId: list.id, title: "Root B" })).value;
    const sectionRoot = (
      await createTask(ownerA, { listId: list.id, sectionId: section.id, title: "Section root" })
    ).value;
    const child = (await createTask(ownerA, { listId: list.id, parentTaskId: rootA.id, title: "Child" }))
      .value;
    const completed = (await createTask(ownerA, { listId: list.id, title: "Completed" })).value;
    const cancelled = (await createTask(ownerA, { listId: list.id, title: "Cancelled" })).value;
    const deleted = (await createTask(ownerA, { listId: list.id, title: "Deleted" })).value;
    await createTask(ownerA, { listId: otherList.id, title: "Other-list task" });
    await application.tasks.transitionTaskStatus(ownerA, completed.id, {
      expectedVersion: 1,
      status: "completed",
    });
    await application.tasks.transitionTaskStatus(ownerA, cancelled.id, {
      expectedVersion: 1,
      status: "cancelled",
    });
    await application.tasks.deleteTask(ownerA, deleted.id, { expectedVersion: 1 });

    const firstPage = await application.tasks.listTasks(ownerA, {
      listId: list.id,
      parentTaskId: null,
      status: "open",
      limit: 2,
    });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = await application.tasks.listTasks(ownerA, {
      listId: list.id,
      parentTaskId: null,
      status: "open",
      cursor: firstPage.nextCursor ?? undefined,
      limit: 2,
    });
    expect([...firstPage.items, ...secondPage.items].map(({ id }) => id)).toEqual(
      expect.arrayContaining([rootA.id, rootB.id, sectionRoot.id]),
    );
    expect(new Set([...firstPage.items, ...secondPage.items].map(({ id }) => id)).size).toBe(3);
    expect(secondPage.nextCursor).toBeNull();

    await expect(
      application.tasks.listTasks(ownerA, {
        listId: list.id,
        sectionId: section.id,
        parentTaskId: null,
        status: "open",
        limit: 100,
      }),
    ).resolves.toMatchObject({ items: [expect.objectContaining({ id: sectionRoot.id })] });
    await expect(
      application.tasks.listTasks(ownerA, {
        listId: list.id,
        parentTaskId: rootA.id,
        status: "open",
        limit: 100,
      }),
    ).resolves.toMatchObject({ items: [expect.objectContaining({ id: child.id })] });
    await expect(
      application.tasks.listTasks(ownerA, {
        listId: list.id,
        parentTaskId: null,
        status: "completed",
        limit: 100,
      }),
    ).resolves.toMatchObject({ items: [expect.objectContaining({ id: completed.id })] });
    await expect(
      application.tasks.listTasks(ownerA, {
        listId: list.id,
        parentTaskId: null,
        status: "cancelled",
        limit: 100,
      }),
    ).resolves.toMatchObject({ items: [expect.objectContaining({ id: cancelled.id })] });
    await expect(application.tasks.getTask(ownerA, deleted.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      application.tasks.listTasks(ownerB, {
        listId: list.id,
        parentTaskId: null,
        status: "open",
        limit: 100,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
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
    id?: string;
    listId: string;
    sectionId?: string | null;
    parentTaskId?: string | null;
    title: string;
    placement?: { kind: "start" | "end" } | { kind: "before" | "after"; anchorId: string };
  },
) {
  return application.tasks.createTask(actor, input.id ?? randomUUID(), {
    title: input.title,
    descriptionMd: "",
    priority: "none",
    listId: input.listId,
    sectionId: input.sectionId ?? null,
    parentTaskId: input.parentTaskId ?? null,
    placement: input.placement ?? { kind: "end" },
  });
}

async function storedTask(id: string) {
  const result = await pool.query(`select id, status, version from tasks where id = $1`, [id]);
  return result.rows[0] ?? null;
}

async function storedChecklistItem(id: string) {
  const result = await pool.query(`select id, task_id, version from checklist_items where id = $1`, [id]);
  return result.rows[0] ?? null;
}
