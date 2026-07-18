import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createFolderApplication } from "../../modules/tasks/application/folder-application.ts";
import { createInboxUseCases } from "../../modules/tasks/application/inbox.ts";
import { createListApplication } from "../../modules/tasks/application/list-application.ts";
import { createSectionApplication } from "../../modules/tasks/application/section-application.ts";
import type { AuthenticatedActor } from "../../shared/auth/actor.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";
import type { Clock } from "../../shared/time/clock.ts";

import { createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const testInstant = new Date("2026-07-19T08:00:00.000Z");
const testClock: Clock = { now: () => new Date(testInstant) };
const fixture = createWp02SchemaFixture("container_application");

let pool: Pool;
let database: Database;
let ownerA: AuthenticatedActor;
let ownerB: AuthenticatedActor;
let inboxAId: string;

type FolderApplication = ReturnType<typeof createFolderApplication>;
type ListApplication = ReturnType<typeof createListApplication>;
type SectionApplication = ReturnType<typeof createSectionApplication>;

let folders: FolderApplication;
let lists: ListApplication;
let sections: SectionApplication;

describe("WP02 container application integration", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema });
    ownerA = { userId: await insertUser(pool, "container-owner-a") };
    ownerB = { userId: await insertUser(pool, "container-owner-b") };

    const inboxes = createInboxUseCases({ database, clock: testClock });
    inboxAId = (await inboxes.ensureInbox(ownerA.userId)).id;
    await inboxes.ensureInbox(ownerB.userId);

    folders = createFolderApplication({ database, clock: testClock });
    lists = createListApplication({ database, clock: testClock });
    sections = createSectionApplication({ database, clock: testClock });
  });

  afterAll(async () => fixture.teardown());

  it("enforces scoped folder creates, CAS writes, active visibility, delete, and restore", async () => {
    const folderId = randomUUID();
    const created = await folders.createFolder(ownerA, folderId, {
      name: "Projects",
      placement: { kind: "end" },
    });
    expect(created).toMatchObject({ created: true, value: { id: folderId, name: "Projects", version: 1 } });

    await expect(
      folders.createFolder(ownerA, folderId, { name: "Projects", placement: { kind: "start" } }),
    ).resolves.toMatchObject({ created: false, value: { id: folderId, version: 1 } });
    await expect(
      folders.createFolder(ownerA, folderId, { name: "Different", placement: { kind: "end" } }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: undefined });

    await expect(folders.getFolder(ownerB, folderId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      folders.updateFolder(ownerB, folderId, { expectedVersion: 1, patch: { name: "Guessed" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(folders.deleteFolder(ownerB, folderId, { expectedVersion: 1 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    await expect(
      folders.updateFolder(ownerA, folderId, { expectedVersion: 9, patch: { name: "Stale" } }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 1 });
    const updated = await folders.updateFolder(ownerA, folderId, {
      expectedVersion: 1,
      patch: { name: "Active projects" },
    });
    expect(updated).toMatchObject({ name: "Active projects", version: 2, deletedAt: null });

    const deleted = await folders.deleteFolder(ownerA, folderId, { expectedVersion: 2 });
    expect(deleted).toMatchObject({ id: folderId, version: 3, deletedAt: testInstant.toISOString() });
    await expect(folders.getFolder(ownerA, folderId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await folders.listFolders(ownerA, { limit: 100 })).items).not.toContainEqual(
      expect.objectContaining({ id: folderId }),
    );
    await expect(folders.restoreFolder(ownerB, folderId, { expectedVersion: 3 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(folders.restoreFolder(ownerA, folderId, { expectedVersion: 2 })).rejects.toMatchObject({
      code: "CONFLICT",
      currentVersion: 3,
    });

    const restored = await folders.restoreFolder(ownerA, folderId, { expectedVersion: 3 });
    expect(restored).toMatchObject({ id: folderId, version: 4, deletedAt: null });
    expect((await folders.listFolders(ownerA, { limit: 100 })).items).toContainEqual(
      expect.objectContaining({ id: folderId, version: 4 }),
    );
  });

  it("keeps folder links reversible, moves regular lists, and hides soft-deleted lists", async () => {
    const sourceFolder = await createFolder(ownerA, "Source");
    const destinationFolder = await createFolder(ownerA, "Destination");
    const listId = randomUUID();
    const input = {
      name: "Launch",
      colorToken: "coral" as const,
      folderId: sourceFolder.id,
      placement: { kind: "end" as const },
    };

    await expect(lists.createRegularList(ownerA, listId, input)).resolves.toMatchObject({
      created: true,
      value: { id: listId, folderId: sourceFolder.id, version: 1 },
    });
    await expect(lists.createRegularList(ownerA, listId, input)).resolves.toMatchObject({
      created: false,
      value: { id: listId, version: 1 },
    });
    await expect(
      lists.createRegularList(ownerA, listId, { ...input, colorToken: "sky" }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: undefined });

    await expect(lists.getRegularList(ownerB, listId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      lists.updateRegularList(ownerB, listId, { expectedVersion: 1, patch: { name: "Guessed" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      lists.moveRegularList(ownerB, listId, {
        expectedVersion: 1,
        folderId: null,
        placement: { kind: "end" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      lists.updateRegularList(ownerA, listId, { expectedVersion: 7, patch: { name: "Stale" } }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 1 });
    const updated = await lists.updateRegularList(ownerA, listId, {
      expectedVersion: 1,
      patch: { name: "Launch plan" },
    });
    expect(updated).toMatchObject({ name: "Launch plan", version: 2, folderId: sourceFolder.id });

    await folders.deleteFolder(ownerA, sourceFolder.id, { expectedVersion: sourceFolder.version });
    expect(await lists.getRegularList(ownerA, listId)).toMatchObject({ folderId: null, version: 2 });
    expect((await lists.listRegularLists(ownerA, { limit: 100 })).items).toContainEqual(
      expect.objectContaining({ id: listId, folderId: null }),
    );
    expect(await storedList(listId)).toMatchObject({ folder_id: sourceFolder.id, deleted_at: null });

    await folders.restoreFolder(ownerA, sourceFolder.id, { expectedVersion: sourceFolder.version + 1 });
    expect(await lists.getRegularList(ownerA, listId)).toMatchObject({ folderId: sourceFolder.id });

    const moved = await lists.moveRegularList(ownerA, listId, {
      expectedVersion: 2,
      folderId: destinationFolder.id,
      placement: { kind: "end" },
    });
    expect(moved).toMatchObject({ id: listId, folderId: destinationFolder.id, version: 3 });
    await expect(
      lists.moveRegularList(ownerA, listId, {
        expectedVersion: 2,
        folderId: null,
        placement: { kind: "end" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 3 });

    const deletedListId = randomUUID();
    await insertRegularListRow({
      id: deletedListId,
      actor: ownerA,
      name: "Deleted list",
      version: 5,
      deletedAt: testInstant,
    });
    await expect(lists.getRegularList(ownerA, deletedListId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await lists.listRegularLists(ownerA, { limit: 100 })).items).not.toContainEqual(
      expect.objectContaining({ id: deletedListId }),
    );
    await expect(
      lists.createRegularList(ownerA, deletedListId, {
        name: "Deleted list",
        colorToken: "slate",
        folderId: null,
        placement: { kind: "end" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      lists.restoreRegularList(ownerA, deletedListId, { expectedVersion: 4 }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      currentVersion: 5,
    });
    expect(await lists.restoreRegularList(ownerA, deletedListId, { expectedVersion: 5 })).toMatchObject({
      id: deletedListId,
      version: 6,
      deletedAt: null,
    });
  });

  it("keeps Inbox immutable and invisible to every ordinary regular-list API", async () => {
    await expect(lists.getRegularList(ownerA, inboxAId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(lists.getRegularList(ownerB, inboxAId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      lists.createRegularList(ownerA, inboxAId, {
        name: "Converted Inbox",
        colorToken: "violet",
        folderId: null,
        placement: { kind: "end" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      lists.updateRegularList(ownerA, inboxAId, {
        expectedVersion: 1,
        patch: { name: "Renamed Inbox" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      lists.moveRegularList(ownerA, inboxAId, {
        expectedVersion: 1,
        folderId: null,
        placement: { kind: "end" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(lists.restoreRegularList(ownerA, inboxAId, { expectedVersion: 1 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(lists.deleteRegularList(ownerA, inboxAId, { expectedVersion: 1 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await lists.listRegularLists(ownerA, { limit: 100 })).items).not.toContainEqual(
      expect.objectContaining({ id: inboxAId }),
    );
    expect(await storedList(inboxAId)).toMatchObject({
      name: "Inbox",
      kind: "inbox",
      folder_id: null,
      version: 1,
      deleted_at: null,
    });
  });

  it("rejects nonempty section deletion and atomically clears deleted-task references", async () => {
    const retainedList = await createRegularList(ownerA, "Retained replay list");
    const retainedSectionId = randomUUID();
    const retainedSectionInput = { name: "Retained section", placement: { kind: "end" as const } };
    await sections.createSection(ownerA, retainedList.id, retainedSectionId, retainedSectionInput);
    await lists.deleteRegularList(ownerA, retainedList.id, { expectedVersion: retainedList.version });
    await expect(
      sections.createSection(ownerA, retainedList.id, retainedSectionId, retainedSectionInput),
    ).resolves.toMatchObject({ created: false, value: { id: retainedSectionId, version: 1 } });

    const list = await createRegularList(ownerA, "Section list");
    const sectionId = randomUUID();
    const sectionInput = { name: "In progress", placement: { kind: "end" as const } };

    await expect(sections.createSection(ownerA, list.id, sectionId, sectionInput)).resolves.toMatchObject({
      created: true,
      value: { id: sectionId, listId: list.id, version: 1 },
    });
    await expect(sections.createSection(ownerA, list.id, sectionId, sectionInput)).resolves.toMatchObject({
      created: false,
      value: { id: sectionId, version: 1 },
    });
    await expect(
      sections.createSection(ownerA, list.id, sectionId, {
        name: "Different",
        placement: { kind: "end" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(sections.listSections(ownerB, list.id, { limit: 100 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(sections.getSection(ownerB, list.id, sectionId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      sections.updateSection(ownerB, list.id, sectionId, {
        expectedVersion: 1,
        patch: { name: "Guessed" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      sections.deleteSection(ownerB, list.id, sectionId, { expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      sections.updateSection(ownerA, list.id, sectionId, {
        expectedVersion: 8,
        patch: { name: "Stale" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 1 });
    const updated = await sections.updateSection(ownerA, list.id, sectionId, {
      expectedVersion: 1,
      patch: { name: "Doing" },
    });
    expect(updated).toMatchObject({ name: "Doing", version: 2 });
    await expect(
      sections.positionSection(ownerA, list.id, sectionId, {
        expectedVersion: 1,
        placement: { kind: "end" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 2 });
    expect(await sections.getSection(ownerA, list.id, sectionId)).toMatchObject({ version: 2 });

    const activeTaskId = randomUUID();
    const previouslyDeletedTaskId = randomUUID();
    await insertTaskRow({
      id: activeTaskId,
      actor: ownerA,
      listId: list.id,
      sectionId,
      title: "Active task",
      version: 1,
      deletedAt: null,
    });
    await insertTaskRow({
      id: previouslyDeletedTaskId,
      actor: ownerA,
      listId: list.id,
      sectionId,
      title: "Deleted task",
      version: 7,
      deletedAt: new Date("2026-07-18T08:00:00.000Z"),
    });

    await expect(
      sections.deleteSection(ownerA, list.id, sectionId, { expectedVersion: 2 }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 2 });
    expect(await storedSection(sectionId)).toMatchObject({ id: sectionId, version: 2 });
    expect(await storedTask(activeTaskId)).toMatchObject({ section_id: sectionId, version: 1 });
    expect(await storedTask(previouslyDeletedTaskId)).toMatchObject({ section_id: sectionId, version: 7 });

    await pool.query(`update tasks set deleted_at = $2 where id = $1`, [
      activeTaskId,
      new Date("2026-07-19T07:00:00.000Z"),
    ]);
    await expect(
      sections.deleteSection(ownerA, list.id, sectionId, { expectedVersion: 2 }),
    ).resolves.toMatchObject({ id: sectionId, version: 2 });

    expect(await storedSection(sectionId)).toBeNull();
    expect(await storedTask(activeTaskId)).toMatchObject({
      section_id: null,
      version: 2,
      updated_at: testInstant,
    });
    expect(await storedTask(previouslyDeletedTaskId)).toMatchObject({
      section_id: null,
      version: 8,
      updated_at: testInstant,
    });
    expect(await sections.listSections(ownerA, list.id, { limit: 100 })).toMatchObject({
      items: [],
      nextCursor: null,
    });

    await expect(sections.createSection(ownerA, list.id, sectionId, sectionInput)).resolves.toMatchObject({
      created: true,
      value: { id: sectionId, version: 1 },
    });
  });
});

async function createFolder(actor: AuthenticatedActor, name: string) {
  const created = await folders.createFolder(actor, randomUUID(), {
    name,
    placement: { kind: "end" },
  });
  return created.value;
}

async function createRegularList(actor: AuthenticatedActor, name: string) {
  const created = await lists.createRegularList(actor, randomUUID(), {
    name,
    colorToken: "slate",
    folderId: null,
    placement: { kind: "end" },
  });
  return created.value;
}

async function insertRegularListRow(input: {
  id: string;
  actor: AuthenticatedActor;
  name: string;
  version: number;
  deletedAt: Date | null;
}) {
  await pool.query(
    `insert into task_lists
       (id, user_id, folder_id, name, color_token, rank, kind, version, created_at, updated_at, deleted_at)
     values ($1, $2, null, $3, 'slate', 'a0', 'regular', $4, $5, $5, $6)`,
    [input.id, input.actor.userId, input.name, input.version, testInstant, input.deletedAt],
  );
}

async function insertTaskRow(input: {
  id: string;
  actor: AuthenticatedActor;
  listId: string;
  sectionId: string;
  title: string;
  version: number;
  deletedAt: Date | null;
}) {
  await pool.query(
    `insert into tasks
       (id, user_id, list_id, section_id, title, description_md, status, priority, rank,
        status_changed_at, version, created_at, updated_at, deleted_at)
     values ($1, $2, $3, $4, $5, '', 'open', 'none', 'a0', $6, $7, $6, $6, $8)`,
    [
      input.id,
      input.actor.userId,
      input.listId,
      input.sectionId,
      input.title,
      testInstant,
      input.version,
      input.deletedAt,
    ],
  );
}

async function storedList(id: string) {
  const result = await pool.query(
    `select id, folder_id, name, kind, version, deleted_at from task_lists where id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

async function storedSection(id: string) {
  const result = await pool.query(`select id, version from list_sections where id = $1`, [id]);
  return result.rows[0] ?? null;
}

async function storedTask(id: string) {
  const result = await pool.query(
    `select id, section_id, version, updated_at, deleted_at from tasks where id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}
