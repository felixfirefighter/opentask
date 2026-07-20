import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createInboxBootstrapPort } from "../../modules/tasks/application/inbox.ts";
import { createDemoDatasetSeeder } from "../../modules/tasks/application/demo-dataset-seeder.ts";
import { createIdentityDatabaseFixture } from "./support/identity-test-fixture.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";
import type { Clock } from "../../shared/time/clock.ts";

const databaseFixture = createIdentityDatabaseFixture("demo-dataset");
const resetAt = new Date("2026-07-20T08:00:00.000Z");
const clock: Clock = { now: () => resetAt };
let database: Database;
let ownerA: string;
let ownerB: string;

describe("deterministic isolated demo dataset", () => {
  beforeAll(async () => {
    database = await databaseFixture.setup();
  });

  beforeEach(async () => {
    await database.delete(schema.user);
    ownerA = await createBootstrappedUser("demo-a");
    ownerB = await createBootstrappedUser("demo-b");
  });

  afterAll(async () => {
    await databaseFixture.teardown();
  });

  it("seeds the complete task story for two owners without sharing records", async () => {
    const seeder = createDemoDatasetSeeder({ database, clock });
    await seeder.reset(ownerA);
    await seeder.reset(ownerB);

    const [tasksA, tasksB, listsA, sectionsA, schedulesA, checklistA, tagsA] = await Promise.all([
      tasksFor(ownerA),
      tasksFor(ownerB),
      database.select().from(schema.taskLists).where(eq(schema.taskLists.userId, ownerA)),
      database.select().from(schema.listSections).where(eq(schema.listSections.userId, ownerA)),
      database.select().from(schema.taskSchedules).where(eq(schema.taskSchedules.userId, ownerA)),
      database.select().from(schema.checklistItems).where(eq(schema.checklistItems.userId, ownerA)),
      database.select().from(schema.tags).where(eq(schema.tags.userId, ownerA)),
    ]);

    expect(tasksA).toHaveLength(10);
    expect(tasksB).toHaveLength(10);
    expect(listsA).toHaveLength(2);
    expect(listsA.filter((list) => list.kind === "inbox")).toHaveLength(1);
    expect(listsA.filter((list) => list.kind === "regular")).toEqual([
      expect.objectContaining({ name: "Community workshop", folderId: expect.any(String) }),
    ]);
    expect(sectionsA).toEqual([expect.objectContaining({ name: "This week" })]);
    expect(schedulesA).toHaveLength(4);
    expect(checklistA).toHaveLength(3);
    expect(tagsA.map((tag) => tag.name).sort()).toEqual(["Design", "Event", "Planning"]);

    const recordA = tasksA.find((task) => task.title === "Outline the workshop agenda")!;
    const recordB = tasksB.find((task) => task.title === "Outline the workshop agenda")!;
    expect(recordA.id).toBe(recordB.id);
    expect(recordA.userId).toBe(ownerA);
    expect(recordB.userId).toBe(ownerB);
    expect(
      tasksA.filter(
        (task) => task.status === "open" && !schedulesA.some((schedule) => schedule.taskId === task.id),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Draft the welcome message", priority: "high" }),
        expect.objectContaining({ title: "Send the agenda to volunteers", priority: "medium" }),
      ]),
    );
  });

  it("serializes duplicate resets and replaces only the selected owner's edits", async () => {
    const seeder = createDemoDatasetSeeder({ database, clock });
    await Promise.all([seeder.reset(ownerA), seeder.reset(ownerB)]);
    const tasksA = await tasksFor(ownerA);
    const recordId = tasksA.find((task) => task.title === "Outline the workshop agenda")!.id;
    const inboxA = await activeInboxId(ownerA);

    await database
      .update(schema.tasks)
      .set({ title: "Visitor-owned edit" })
      .where(and(eq(schema.tasks.userId, ownerA), eq(schema.tasks.id, recordId)));
    await database
      .update(schema.tasks)
      .set({ title: "Friend-owned edit" })
      .where(and(eq(schema.tasks.userId, ownerB), eq(schema.tasks.id, recordId)));
    await database.insert(schema.tasks).values({
      id: randomUUID(),
      userId: ownerA,
      listId: inboxA,
      sectionId: null,
      parentTaskId: null,
      title: "Temporary demo edit",
      descriptionMd: "",
      status: "open",
      priority: "none",
      rank: "z0",
      statusChangedAt: resetAt,
      version: 1,
      createdAt: resetAt,
      updatedAt: resetAt,
      deletedAt: null,
    });

    await Promise.all([seeder.reset(ownerA), seeder.reset(ownerA)]);

    const resetA = await tasksFor(ownerA);
    const untouchedB = await tasksFor(ownerB);
    expect(resetA).toHaveLength(10);
    expect(resetA.some((task) => task.title === "Outline the workshop agenda")).toBe(true);
    expect(resetA.some((task) => task.title === "Temporary demo edit")).toBe(false);
    expect(untouchedB).toHaveLength(10);
    expect(untouchedB.some((task) => task.title === "Friend-owned edit")).toBe(true);
  });

  it("rolls back a failed replacement without erasing the previous demo", async () => {
    const seeder = createDemoDatasetSeeder({ database, clock });
    await seeder.reset(ownerA);
    await database
      .update(schema.tasks)
      .set({ title: "Preserve this previous demo" })
      .where(and(eq(schema.tasks.userId, ownerA), eq(schema.tasks.title, "Outline the workshop agenda")));
    await database.execute(
      sql`alter table tasks add constraint demo_dataset_forced_failure
          check (title <> 'Outline the workshop agenda')`,
    );

    try {
      await expect(seeder.reset(ownerA)).rejects.toThrow();
      const rows = await tasksFor(ownerA);
      expect(rows).toHaveLength(10);
      expect(rows.some((task) => task.title === "Preserve this previous demo")).toBe(true);
    } finally {
      await database.execute(sql`alter table tasks drop constraint demo_dataset_forced_failure`);
    }
  });
});

async function createBootstrappedUser(label: string): Promise<string> {
  const userId = randomUUID();
  await database.insert(schema.user).values({
    id: userId,
    name: label,
    email: `${label}-${userId}@example.test`,
    emailVerified: false,
    createdAt: resetAt,
    updatedAt: resetAt,
  });
  await database.transaction((transaction) =>
    createInboxBootstrapPort(database, clock).ensureInbox(userId, transaction),
  );
  return userId;
}

function tasksFor(userId: string) {
  return database.select().from(schema.tasks).where(eq(schema.tasks.userId, userId));
}

async function activeInboxId(userId: string): Promise<string> {
  const [inbox] = await database
    .select({ id: schema.taskLists.id })
    .from(schema.taskLists)
    .where(and(eq(schema.taskLists.userId, userId), eq(schema.taskLists.kind, "inbox")))
    .limit(1);
  if (!inbox) throw new Error("Test account is missing its Inbox.");
  return inbox.id;
}
