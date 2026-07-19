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

const testInstant = new Date("2026-07-19T12:00:00.000Z");
const testClock: Clock = { now: () => new Date(testInstant) };
const fixture = createWp02SchemaFixture("actor_scoped_create_ids");

let pool: Pool;
let database: Database;
let ownerA: AuthenticatedActor;
let ownerB: AuthenticatedActor;
let application: ReturnType<typeof createTasksApplication>;

describe("WP02 actor-scoped create IDs", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema });
    ownerA = { userId: await insertUser(pool, "create-id-owner-a") };
    ownerB = { userId: await insertUser(pool, "create-id-owner-b") };
    const inboxes = createInboxUseCases({ database, clock: testClock });
    await inboxes.ensureInbox(ownerA.userId);
    await inboxes.ensureInbox(ownerB.userId);
    application = createTasksApplication({ database, clock: testClock, taskSchedules: schema.taskSchedules });
  });

  afterAll(async () => fixture.teardown());

  it("creates and replays the same client UUID independently for both actors in every aggregate", async () => {
    const ids = {
      folder: randomUUID(),
      list: randomUUID(),
      section: randomUUID(),
      task: randomUUID(),
      checklist: randomUUID(),
      tag: randomUUID(),
    };
    const folderInputs = [
      { name: "Owner A folder", placement: { kind: "end" as const } },
      { name: "Owner B folder", placement: { kind: "end" as const } },
    ] as const;

    await expectCreatedPair(
      application.folders.createFolder(ownerA, ids.folder, folderInputs[0]),
      application.folders.createFolder(ownerB, ids.folder, folderInputs[1]),
      ids.folder,
    );

    const listInputs = [
      {
        name: "Owner A list",
        colorToken: "coral" as const,
        folderId: ids.folder,
        placement: { kind: "end" as const },
      },
      {
        name: "Owner B list",
        colorToken: "sky" as const,
        folderId: ids.folder,
        placement: { kind: "end" as const },
      },
    ] as const;
    await expectCreatedPair(
      application.lists.createRegularList(ownerA, ids.list, listInputs[0]),
      application.lists.createRegularList(ownerB, ids.list, listInputs[1]),
      ids.list,
    );

    const sectionInputs = [
      { name: "Owner A section", placement: { kind: "end" as const } },
      { name: "Owner B section", placement: { kind: "end" as const } },
    ] as const;
    await expectCreatedPair(
      application.sections.createSection(ownerA, ids.list, ids.section, sectionInputs[0]),
      application.sections.createSection(ownerB, ids.list, ids.section, sectionInputs[1]),
      ids.section,
    );

    const taskInputs = [
      {
        title: "Owner A task",
        descriptionMd: "",
        priority: "none" as const,
        listId: ids.list,
        sectionId: ids.section,
        parentTaskId: null,
        placement: { kind: "end" as const },
      },
      {
        title: "Owner B task",
        descriptionMd: "",
        priority: "none" as const,
        listId: ids.list,
        sectionId: ids.section,
        parentTaskId: null,
        placement: { kind: "end" as const },
      },
    ] as const;
    await expectCreatedPair(
      application.tasks.createTask(ownerA, ids.task, taskInputs[0]),
      application.tasks.createTask(ownerB, ids.task, taskInputs[1]),
      ids.task,
    );

    const checklistInputs = [
      { title: "Owner A checklist", placement: { kind: "end" as const } },
      { title: "Owner B checklist", placement: { kind: "end" as const } },
    ] as const;
    await expectCreatedPair(
      application.checklist.createChecklistItem(ownerA, ids.task, ids.checklist, checklistInputs[0]),
      application.checklist.createChecklistItem(ownerB, ids.task, ids.checklist, checklistInputs[1]),
      ids.checklist,
    );

    const tagInputs = [
      { name: "Owner A tag", colorToken: "mint" as const },
      { name: "Owner B tag", colorToken: "violet" as const },
    ] as const;
    await expectCreatedPair(
      application.tags.createTag(ownerA, ids.tag, tagInputs[0]),
      application.tags.createTag(ownerB, ids.tag, tagInputs[1]),
      ids.tag,
    );

    await expectReplayPair(
      application.folders.createFolder(ownerA, ids.folder, folderInputs[0]),
      application.folders.createFolder(ownerB, ids.folder, folderInputs[1]),
      ids.folder,
    );
    await expectReplayPair(
      application.lists.createRegularList(ownerA, ids.list, listInputs[0]),
      application.lists.createRegularList(ownerB, ids.list, listInputs[1]),
      ids.list,
    );
    await expectReplayPair(
      application.sections.createSection(ownerA, ids.list, ids.section, sectionInputs[0]),
      application.sections.createSection(ownerB, ids.list, ids.section, sectionInputs[1]),
      ids.section,
    );
    await expectReplayPair(
      application.tasks.createTask(ownerA, ids.task, taskInputs[0]),
      application.tasks.createTask(ownerB, ids.task, taskInputs[1]),
      ids.task,
    );
    await expectReplayPair(
      application.checklist.createChecklistItem(ownerA, ids.task, ids.checklist, checklistInputs[0]),
      application.checklist.createChecklistItem(ownerB, ids.task, ids.checklist, checklistInputs[1]),
      ids.checklist,
    );
    await expectReplayPair(
      application.tags.createTag(ownerA, ids.tag, tagInputs[0]),
      application.tags.createTag(ownerB, ids.tag, tagInputs[1]),
      ids.tag,
    );

    await expect(
      Promise.all([
        application.tags.replaceTaskTags(ownerA, ids.task, {
          expectedVersion: 1,
          tagIds: [ids.tag],
        }),
        application.tags.replaceTaskTags(ownerB, ids.task, {
          expectedVersion: 1,
          tagIds: [ids.tag],
        }),
      ]),
    ).resolves.toEqual([
      expect.objectContaining({
        task: { id: ids.task, version: 2 },
        tags: [expect.objectContaining({ name: "Owner A tag" })],
      }),
      expect.objectContaining({
        task: { id: ids.task, version: 2 },
        tags: [expect.objectContaining({ name: "Owner B tag" })],
      }),
    ]);

    await expect(application.tasks.getTask(ownerA, ids.task)).resolves.toMatchObject({
      title: "Owner A task",
      checklistItems: [expect.objectContaining({ title: "Owner A checklist" })],
      tags: [expect.objectContaining({ name: "Owner A tag" })],
    });
    await expect(application.tasks.getTask(ownerB, ids.task)).resolves.toMatchObject({
      title: "Owner B task",
      checklistItems: [expect.objectContaining({ title: "Owner B checklist" })],
      tags: [expect.objectContaining({ name: "Owner B tag" })],
    });
  });
});

async function expectCreatedPair(
  ownerAResult: Promise<{ created: boolean; value: { id: string } }>,
  ownerBResult: Promise<{ created: boolean; value: { id: string } }>,
  id: string,
) {
  await expect(Promise.all([ownerAResult, ownerBResult])).resolves.toEqual([
    expect.objectContaining({ created: true, value: expect.objectContaining({ id }) }),
    expect.objectContaining({ created: true, value: expect.objectContaining({ id }) }),
  ]);
}

async function expectReplayPair(
  ownerAResult: Promise<{ created: boolean; value: { id: string } }>,
  ownerBResult: Promise<{ created: boolean; value: { id: string } }>,
  id: string,
) {
  await expect(Promise.all([ownerAResult, ownerBResult])).resolves.toEqual([
    expect.objectContaining({ created: false, value: expect.objectContaining({ id }) }),
    expect.objectContaining({ created: false, value: expect.objectContaining({ id }) }),
  ]);
}
