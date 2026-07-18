import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createListApplication } from "../../modules/tasks/application/list-application.ts";
import { createSectionApplication } from "../../modules/tasks/application/section-application.ts";
import type { AuthenticatedActor } from "../../shared/auth/actor.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";
import type { Clock } from "../../shared/time/clock.ts";

import { createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const mutationInstant = new Date("2026-07-19T08:00:00.000Z");
const seedInstant = new Date("2026-07-17T08:00:00.000Z");
const testClock: Clock = { now: () => new Date(mutationInstant) };
const fixture = createWp02SchemaFixture("list_deletion");

let pool: Pool;
let database: Database;
let ownerA: AuthenticatedActor;
let ownerB: AuthenticatedActor;
let lists: ReturnType<typeof createListApplication>;
let sections: ReturnType<typeof createSectionApplication>;

describe("WP02 regular-list deletion transaction", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema });
    ownerA = { userId: await insertUser(pool, "list-delete-owner-a") };
    ownerB = { userId: await insertUser(pool, "list-delete-owner-b") };
    lists = createListApplication({ database, clock: testClock });
    sections = createSectionApplication({ database, clock: testClock });
  });

  afterAll(async () => fixture.teardown());

  it("requires a different active owned destination and rolls back every rejected delete", async () => {
    const source = await createRegularList(ownerA, "Delete source");
    const destination = await createRegularList(ownerA, "Delete destination");
    const foreignDestination = await createRegularList(ownerB, "Foreign destination");
    const deletedDestination = await createRegularList(ownerA, "Deleted destination");
    await lists.deleteRegularList(ownerA, deletedDestination.id, { expectedVersion: 1 });

    const sectionId = randomUUID();
    await sections.createSection(ownerA, source.id, sectionId, {
      name: "Source section",
      placement: { kind: "end" },
    });
    const taskId = randomUUID();
    await insertTaskRow({
      id: taskId,
      actor: ownerA,
      listId: source.id,
      sectionId,
      title: "Must not move",
      version: 4,
      deletedAt: null,
    });

    const listIds = [source.id, destination.id, foreignDestination.id, deletedDestination.id];
    const taskIds = [taskId];
    const baseline = await storedDeletionState(listIds, taskIds);
    const expectRollback = async (work: Promise<unknown>, error: Record<string, unknown>) => {
      await expect(work).rejects.toMatchObject(error);
      expect(await storedDeletionState(listIds, taskIds)).toEqual(baseline);
    };

    await expectRollback(lists.deleteRegularList(ownerA, source.id, { expectedVersion: 1 }), {
      code: "CONFLICT",
      currentVersion: 1,
    });
    await expectRollback(
      lists.deleteRegularList(ownerA, source.id, {
        expectedVersion: 1,
        moveTasksToListId: source.id,
      }),
      { code: "CONFLICT", currentVersion: 1 },
    );
    await expectRollback(
      lists.deleteRegularList(ownerA, source.id, {
        expectedVersion: 1,
        moveTasksToListId: foreignDestination.id,
      }),
      { code: "NOT_FOUND" },
    );
    await expectRollback(
      lists.deleteRegularList(ownerA, source.id, {
        expectedVersion: 1,
        moveTasksToListId: deletedDestination.id,
      }),
      { code: "NOT_FOUND" },
    );
    await expectRollback(
      lists.deleteRegularList(ownerA, source.id, {
        expectedVersion: 9,
        moveTasksToListId: destination.id,
      }),
      { code: "CONFLICT", currentVersion: 1 },
    );
    await expectRollback(
      lists.deleteRegularList(ownerB, source.id, {
        expectedVersion: 1,
        moveTasksToListId: foreignDestination.id,
      }),
      { code: "NOT_FOUND" },
    );

    expect(await lists.getRegularList(ownerA, source.id)).toMatchObject({ id: source.id, version: 1 });
    expect(await lists.getRegularList(ownerB, foreignDestination.id)).toMatchObject({
      id: foreignDestination.id,
      version: 1,
    });
  });

  it("moves the active tree and deleted direct child once while preserving a deleted tree", async () => {
    const source = await createRegularList(ownerA, "Populated source");
    const destination = await createRegularList(ownerA, "Populated destination");
    const sectionId = randomUUID();
    await sections.createSection(ownerA, source.id, sectionId, {
      name: "Move away",
      placement: { kind: "end" },
    });

    const activeRootId = randomUUID();
    const activeChildId = randomUUID();
    const deletedDirectChildId = randomUUID();
    const deletedRootId = randomUUID();
    const deletedTreeChildId = randomUUID();
    const deletedAt = new Date("2026-07-16T08:00:00.000Z");

    await insertTaskRow({
      id: activeRootId,
      actor: ownerA,
      listId: source.id,
      sectionId,
      title: "Active root",
      version: 2,
      deletedAt: null,
    });
    await insertTaskRow({
      id: activeChildId,
      actor: ownerA,
      listId: source.id,
      sectionId,
      parentTaskId: activeRootId,
      title: "Active child",
      version: 4,
      deletedAt: null,
    });
    await insertTaskRow({
      id: deletedDirectChildId,
      actor: ownerA,
      listId: source.id,
      sectionId,
      parentTaskId: activeRootId,
      title: "Deleted child of active root",
      version: 6,
      deletedAt,
    });
    await insertTaskRow({
      id: deletedRootId,
      actor: ownerA,
      listId: source.id,
      sectionId,
      title: "Deleted root",
      version: 8,
      deletedAt,
    });
    await insertTaskRow({
      id: deletedTreeChildId,
      actor: ownerA,
      listId: source.id,
      sectionId,
      parentTaskId: deletedRootId,
      title: "Deleted child of deleted root",
      version: 10,
      deletedAt,
    });

    const deleted = await lists.deleteRegularList(ownerA, source.id, {
      expectedVersion: 1,
      moveTasksToListId: destination.id,
    });
    expect(deleted).toMatchObject({
      id: source.id,
      version: 2,
      deletedAt: mutationInstant.toISOString(),
    });
    expect(await storedList(source.id)).toMatchObject({
      user_id: ownerA.userId,
      version: 2,
      deleted_at: mutationInstant,
      updated_at: mutationInstant,
    });
    expect(await storedList(destination.id)).toMatchObject({
      user_id: ownerA.userId,
      version: 1,
      deleted_at: null,
    });

    expect(await storedTask(activeRootId)).toMatchObject({
      user_id: ownerA.userId,
      list_id: destination.id,
      section_id: null,
      parent_task_id: null,
      version: 3,
      updated_at: mutationInstant,
      deleted_at: null,
    });
    expect(await storedTask(activeChildId)).toMatchObject({
      list_id: destination.id,
      section_id: null,
      parent_task_id: activeRootId,
      version: 5,
      updated_at: mutationInstant,
      deleted_at: null,
    });
    expect(await storedTask(deletedDirectChildId)).toMatchObject({
      list_id: destination.id,
      section_id: null,
      parent_task_id: activeRootId,
      version: 7,
      updated_at: mutationInstant,
      deleted_at: deletedAt,
    });
    expect(await storedTask(deletedRootId)).toMatchObject({
      list_id: source.id,
      section_id: sectionId,
      parent_task_id: null,
      version: 8,
      updated_at: seedInstant,
      deleted_at: deletedAt,
    });
    expect(await storedTask(deletedTreeChildId)).toMatchObject({
      list_id: source.id,
      section_id: sectionId,
      parent_task_id: deletedRootId,
      version: 10,
      updated_at: seedInstant,
      deleted_at: deletedAt,
    });

    await expect(lists.getRegularList(ownerA, source.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await lists.listRegularLists(ownerA, { limit: 100 })).items).not.toContainEqual(
      expect.objectContaining({ id: source.id }),
    );
    await expect(lists.restoreRegularList(ownerA, source.id, { expectedVersion: 2 })).resolves.toMatchObject({
      id: source.id,
      version: 3,
      deletedAt: null,
    });

    expect(await storedTask(activeRootId)).toMatchObject({ list_id: destination.id, version: 3 });
    expect(await storedTask(activeChildId)).toMatchObject({ list_id: destination.id, version: 5 });
    expect(await storedTask(deletedDirectChildId)).toMatchObject({ list_id: destination.id, version: 7 });
    expect(await storedTask(deletedRootId)).toMatchObject({ list_id: source.id, version: 8 });
    expect(await storedTask(deletedTreeChildId)).toMatchObject({ list_id: source.id, version: 10 });
    expect(await storedList(destination.id)).toMatchObject({ version: 1, deleted_at: null });
  });

  it("deletes a list with no active tasks without a destination", async () => {
    const source = await createRegularList(ownerA, "No active tasks");
    const deletedTaskId = randomUUID();
    const deletedAt = new Date("2026-07-15T08:00:00.000Z");
    await insertTaskRow({
      id: deletedTaskId,
      actor: ownerA,
      listId: source.id,
      sectionId: null,
      title: "Already deleted",
      version: 3,
      deletedAt,
    });

    await expect(lists.deleteRegularList(ownerA, source.id, { expectedVersion: 1 })).resolves.toMatchObject({
      id: source.id,
      version: 2,
      deletedAt: mutationInstant.toISOString(),
    });
    await expect(lists.getRegularList(ownerA, source.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await storedTask(deletedTaskId)).toMatchObject({
      user_id: ownerA.userId,
      list_id: source.id,
      section_id: null,
      version: 3,
      updated_at: seedInstant,
      deleted_at: deletedAt,
    });
  });
});

async function createRegularList(actor: AuthenticatedActor, name: string) {
  const created = await lists.createRegularList(actor, randomUUID(), {
    name,
    colorToken: "slate",
    folderId: null,
    placement: { kind: "end" },
  });
  return created.value;
}

async function insertTaskRow(input: {
  id: string;
  actor: AuthenticatedActor;
  listId: string;
  sectionId: string | null;
  parentTaskId?: string | null;
  title: string;
  version: number;
  deletedAt: Date | null;
}) {
  await pool.query(
    `insert into tasks
       (id, user_id, list_id, section_id, parent_task_id, title, description_md, status, priority, rank,
        status_changed_at, version, created_at, updated_at, deleted_at)
     values ($1, $2, $3, $4, $5, $6, '', 'open', 'none', 'a0', $7, $8, $7, $7, $9)`,
    [
      input.id,
      input.actor.userId,
      input.listId,
      input.sectionId,
      input.parentTaskId ?? null,
      input.title,
      seedInstant,
      input.version,
      input.deletedAt,
    ],
  );
}

async function storedList(id: string) {
  const result = await pool.query(
    `select id, user_id, folder_id, name, kind, version, updated_at, deleted_at
       from task_lists where id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

async function storedTask(id: string) {
  const result = await pool.query(
    `select id, user_id, list_id, section_id, parent_task_id, version, updated_at, deleted_at
       from tasks where id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

async function storedDeletionState(listIds: readonly string[], taskIds: readonly string[]) {
  return {
    lists: await Promise.all(listIds.map(storedList)),
    tasks: await Promise.all(taskIds.map(storedTask)),
  };
}
