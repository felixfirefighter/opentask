import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSearchApplication } from "../../modules/tasks/application/search-application.ts";
import { generateRankAfter } from "../../modules/tasks/application/ranking.ts";
import { createTagApplication } from "../../modules/tasks/application/tag-application.ts";
import { createTaskApplication } from "../../modules/tasks/application/task-application.ts";
import type { AuthenticatedActor } from "../../shared/auth/actor.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";
import type { Clock } from "../../shared/time/clock.ts";

import { createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const testInstant = new Date("2026-07-19T10:00:00.000Z");
const testClock: Clock = { now: () => new Date(testInstant) };
const fixture = createWp02SchemaFixture("tag_search_application");

let pool: Pool;
let database: Database;
let ownerA: AuthenticatedActor;
let ownerB: AuthenticatedActor;
let listAId: string;
let listBId: string;
let nextTaskRank = "a0";

type TagApplication = ReturnType<typeof createTagApplication>;
type SearchApplication = ReturnType<typeof createSearchApplication>;
type TaskApplication = ReturnType<typeof createTaskApplication>;

let tags: TagApplication;
let search: SearchApplication;
let tasks: TaskApplication;

describe("WP02 tag, task-tag, and search application integration", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema });
    ownerA = { userId: await insertUser(pool, "tag-search-owner-a") };
    ownerB = { userId: await insertUser(pool, "tag-search-owner-b") };
    listAId = await insertList(ownerA, "Owner A list");
    listBId = await insertList(ownerB, "Owner B list");
    tags = createTagApplication({ database, clock: testClock });
    search = createSearchApplication({ database });
    tasks = createTaskApplication({ database, clock: testClock, taskSchedules: schema.taskSchedules });
  });

  afterAll(async () => fixture.teardown());

  it("enforces replay, ownership, CAS, and serialized NFKC-equivalent tag uniqueness", async () => {
    const replayId = randomUUID();
    await expect(
      tags.createTag(ownerA, replayId, { name: "  Cafe\u0301  ", colorToken: "coral" }),
    ).resolves.toMatchObject({ created: true, value: { id: replayId, name: "Café", version: 1 } });
    await expect(
      tags.createTag(ownerA, replayId, { name: "Café", colorToken: "coral" }),
    ).resolves.toMatchObject({ created: false, value: { id: replayId, version: 1 } });
    await expect(tags.createTag(ownerA, replayId, { name: "Café", colorToken: "sky" })).rejects.toMatchObject(
      { code: "CONFLICT", currentVersion: undefined },
    );

    await expect(tags.getTag(ownerB, replayId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      tags.updateTag(ownerB, replayId, { expectedVersion: 1, patch: { name: "Guessed" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", currentVersion: undefined });
    await expect(tags.deleteTag(ownerB, replayId, { expectedVersion: 1 })).rejects.toMatchObject({
      code: "NOT_FOUND",
      currentVersion: undefined,
    });
    await expect(
      tags.updateTag(ownerA, replayId, { expectedVersion: 9, patch: { colorToken: "sky" } }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 1 });

    const compatibilityId = randomUUID();
    const renameCandidateId = randomUUID();
    await tags.createTag(ownerA, compatibilityId, { name: "Ｆｏｃｕｓ", colorToken: "violet" });
    await expect(
      tags.createTag(ownerA, randomUUID(), { name: "focus", colorToken: "slate" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await tags.createTag(ownerA, renameCandidateId, { name: "Candidate", colorToken: "mint" });
    await expect(
      tags.updateTag(ownerA, renameCandidateId, {
        expectedVersion: 1,
        patch: { name: "FOCUS" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: undefined });

    await tags.deleteTag(ownerA, compatibilityId, { expectedVersion: 1 });
    const replacementId = randomUUID();
    await tags.createTag(ownerA, replacementId, { name: "focus", colorToken: "slate" });
    await expect(tags.restoreTag(ownerA, compatibilityId, { expectedVersion: 2 })).rejects.toMatchObject({
      code: "CONFLICT",
      currentVersion: undefined,
    });
    await tags.deleteTag(ownerA, replacementId, { expectedVersion: 1 });
    await expect(tags.restoreTag(ownerA, compatibilityId, { expectedVersion: 2 })).resolves.toMatchObject({
      id: compatibilityId,
      version: 3,
      deletedAt: null,
    });
    await expect(
      tags.createTag(ownerB, randomUUID(), { name: "focus", colorToken: "amber" }),
    ).resolves.toMatchObject({ created: true });

    const raceSuffix = randomUUID().slice(0, 8);
    const concurrent = await Promise.allSettled([
      tags.createTag(ownerA, randomUUID(), { name: `Race-${raceSuffix}`, colorToken: "sky" }),
      tags.createTag(ownerA, randomUUID(), { name: `Ｒａｃｅ-${raceSuffix}`, colorToken: "sky" }),
    ]);
    expect(concurrent.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = concurrent.find(({ status }) => status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected", reason: { code: "CONFLICT" } });
    expect(await activeEquivalentTagCount(ownerA.userId, `race-${raceSuffix}`)).toBe(1);
  });

  it("atomically replaces task tags and makes tag soft-delete associations reversible", async () => {
    const taskAId = await insertTask({ actor: ownerA, listId: listAId, title: "Association carrier" });
    const foreignTaskId = await insertTask({ actor: ownerB, listId: listBId, title: "Foreign task" });
    const deletedTaskId = await insertTask({
      actor: ownerA,
      listId: listAId,
      title: "Deleted task",
      deletedAt: testInstant,
    });
    const signal = `HiddenSignal-${randomUUID().slice(0, 8)}`;
    const tagAId = randomUUID();
    const secondTagId = randomUUID();
    const deletedTagId = randomUUID();
    const foreignTagId = randomUUID();
    await tags.createTag(ownerA, tagAId, { name: signal, colorToken: "coral" });
    await tags.createTag(ownerA, secondTagId, { name: "Second association", colorToken: "mint" });
    await tags.createTag(ownerA, deletedTagId, { name: "Deleted association", colorToken: "amber" });
    await tags.deleteTag(ownerA, deletedTagId, { expectedVersion: 1 });
    await tags.createTag(ownerB, foreignTagId, { name: "Foreign association", colorToken: "violet" });

    await expect(
      tags.replaceTaskTags(ownerA, taskAId, {
        expectedVersion: 1,
        tagIds: [tagAId, secondTagId],
      }),
    ).resolves.toMatchObject({
      task: { id: taskAId, version: 2 },
      tags: [{ id: tagAId }, { id: secondTagId }],
    });
    expect(await storedTaskVersion(taskAId)).toBe(2);
    expect(await storedTaskTagIds(ownerA.userId, taskAId)).toEqual([tagAId, secondTagId].sort());

    for (const tagIds of [[foreignTagId], [deletedTagId]]) {
      await expect(
        tags.replaceTaskTags(ownerA, taskAId, { expectedVersion: 2, tagIds }),
      ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: undefined });
      expect(await storedTaskVersion(taskAId)).toBe(2);
      expect(await storedTaskTagIds(ownerA.userId, taskAId)).toEqual([tagAId, secondTagId].sort());
    }
    await expect(
      tags.replaceTaskTags(ownerA, taskAId, { expectedVersion: 1, tagIds: [tagAId] }),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: 2 });
    await expect(
      tags.replaceTaskTags(ownerA, foreignTaskId, { expectedVersion: 1, tagIds: [tagAId] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", currentVersion: undefined });
    await expect(
      tags.replaceTaskTags(ownerA, deletedTaskId, { expectedVersion: 1, tagIds: [tagAId] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", currentVersion: undefined });

    await expect(
      tags.replaceTaskTags(ownerA, taskAId, { expectedVersion: 2, tagIds: [tagAId] }),
    ).resolves.toMatchObject({ task: { id: taskAId, version: 3 }, tags: [{ id: tagAId }] });
    expect(await storedTaskVersion(taskAId)).toBe(3);
    expect(await storedTaskTagIds(ownerA.userId, taskAId)).toEqual([tagAId]);

    await tags.deleteTag(ownerA, tagAId, { expectedVersion: 1 });
    expect(await storedTaskTagIds(ownerA.userId, taskAId)).toEqual([tagAId]);
    await expect(tasks.getTask(ownerA, taskAId)).resolves.toMatchObject({ id: taskAId, tags: [] });
    await expect(search.searchTasks(ownerA, { q: signal, limit: 20 })).resolves.toMatchObject({
      items: [],
      nextCursor: null,
    });

    await expect(
      tags.replaceTaskTags(ownerA, taskAId, { expectedVersion: 3, tagIds: [secondTagId] }),
    ).resolves.toMatchObject({
      task: { id: taskAId, version: 4 },
      tags: [{ id: secondTagId }],
    });
    expect(await storedTaskTagIds(ownerA.userId, taskAId)).toEqual([tagAId, secondTagId].sort());

    await tags.restoreTag(ownerA, tagAId, { expectedVersion: 2 });
    await expect(tasks.getTask(ownerA, taskAId)).resolves.toMatchObject({
      id: taskAId,
      version: 4,
      tags: [
        expect.objectContaining({ id: tagAId, version: 3 }),
        expect.objectContaining({ id: secondTagId }),
      ],
    });
    await expect(search.searchTasks(ownerA, { q: signal, limit: 20 })).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          task: expect.objectContaining({ id: taskAId, version: 4 }),
          matchedFields: ["tag"],
          matchingTags: [expect.objectContaining({ id: tagAId })],
        }),
      ],
    });
  });

  it("searches title, description, and active tags with stable pages and no ownership/deletion leaks", async () => {
    const titleTaskId = await insertTask({
      actor: ownerA,
      listId: listAId,
      title: "Orbitneedle title",
      updatedAt: new Date("2026-07-19T11:04:00.000Z"),
    });
    const descriptionTaskId = await insertTask({
      actor: ownerA,
      listId: listAId,
      title: "Closed description task",
      descriptionMd: "Orbitneedle description",
      status: "completed",
      updatedAt: new Date("2026-07-19T11:03:00.000Z"),
    });
    const tagTaskId = await insertTask({
      actor: ownerA,
      listId: listAId,
      title: "Cancelled tag task",
      status: "cancelled",
      updatedAt: new Date("2026-07-19T11:02:00.000Z"),
    });
    const combinedTaskId = await insertTask({
      actor: ownerA,
      listId: listAId,
      title: "Orbitneedle combined",
      descriptionMd: "Orbitneedle also appears here",
      updatedAt: new Date("2026-07-19T11:01:00.000Z"),
    });
    const deletedTaskId = await insertTask({
      actor: ownerA,
      listId: listAId,
      title: "Orbitneedle deleted",
      updatedAt: new Date("2026-07-19T11:06:00.000Z"),
      deletedAt: testInstant,
    });
    const foreignTaskId = await insertTask({
      actor: ownerB,
      listId: listBId,
      title: "Orbitneedle foreign",
      updatedAt: new Date("2026-07-19T11:07:00.000Z"),
    });
    const deletedTagTaskId = await insertTask({
      actor: ownerA,
      listId: listAId,
      title: "Deleted tag carrier",
      updatedAt: new Date("2026-07-19T11:05:00.000Z"),
    });
    const activeTagId = await insertTag(ownerA, "Orbitneedle label");
    const deletedTagId = await insertTag(ownerA, "Orbitneedle deleted label", testInstant);
    const foreignTagId = await insertTag(ownerB, "Orbitneedle foreign label");
    await linkTag(ownerA.userId, tagTaskId, activeTagId);
    await linkTag(ownerA.userId, combinedTaskId, activeTagId);
    await linkTag(ownerA.userId, deletedTagTaskId, deletedTagId);
    await linkTag(ownerB.userId, foreignTaskId, foreignTagId);

    const first = await search.searchTasks(ownerA, { q: "orbitneedle", limit: 2 });
    expect(first.items.map(({ task }) => task.id)).toEqual([titleTaskId, descriptionTaskId]);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await search.searchTasks(ownerA, {
      q: "orbitneedle",
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.items.map(({ task }) => task.id)).toEqual([tagTaskId, combinedTaskId]);
    expect(second.nextCursor).toBeNull();

    const all = [...first.items, ...second.items];
    expect(new Set(all.map(({ task }) => task.id))).toEqual(
      new Set([titleTaskId, descriptionTaskId, tagTaskId, combinedTaskId]),
    );
    expect(all.find(({ task }) => task.id === titleTaskId)?.matchedFields).toEqual(["title"]);
    expect(all.find(({ task }) => task.id === descriptionTaskId)).toMatchObject({
      task: { status: "completed" },
      matchedFields: ["description"],
    });
    expect(all.find(({ task }) => task.id === tagTaskId)).toMatchObject({
      task: { status: "cancelled" },
      matchedFields: ["tag"],
      matchingTags: [expect.objectContaining({ id: activeTagId })],
    });
    expect(all.find(({ task }) => task.id === combinedTaskId)).toMatchObject({
      matchedFields: ["title", "description", "tag"],
      matchingTags: [expect.objectContaining({ id: activeTagId })],
    });
    const visibleIds = all.map(({ task }) => task.id);
    for (const hiddenId of [deletedTaskId, foreignTaskId, deletedTagTaskId]) {
      expect(visibleIds).not.toContain(hiddenId);
    }
    expect(JSON.stringify(all)).not.toContain(ownerA.userId);
    expect(JSON.stringify(all)).not.toContain(ownerB.userId);
  });
});

async function insertList(actor: AuthenticatedActor, name: string): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into task_lists (id, user_id, name, color_token, rank, kind)
     values ($1, $2, $3, 'slate', 'a0', 'regular')`,
    [id, actor.userId, name],
  );
  return id;
}

async function insertTask(input: {
  actor: AuthenticatedActor;
  listId: string;
  title: string;
  descriptionMd?: string;
  status?: "open" | "completed" | "cancelled";
  updatedAt?: Date;
  deletedAt?: Date | null;
}): Promise<string> {
  const id = randomUUID();
  const timestamp = input.updatedAt ?? testInstant;
  const rank = nextTaskRank;
  nextTaskRank = generateRankAfter(rank);
  await pool.query(
    `insert into tasks
       (id, user_id, list_id, title, description_md, status, priority, rank,
        status_changed_at, version, created_at, updated_at, deleted_at)
     values ($1, $2, $3, $4, $5, $6, 'none', $7, $8, 1, $8, $8, $9)`,
    [
      id,
      input.actor.userId,
      input.listId,
      input.title,
      input.descriptionMd ?? "",
      input.status ?? "open",
      rank,
      timestamp,
      input.deletedAt ?? null,
    ],
  );
  return id;
}

async function insertTag(actor: AuthenticatedActor, name: string, deletedAt: Date | null = null) {
  const id = randomUUID();
  await pool.query(
    `insert into tags (id, user_id, name, color_token, deleted_at)
     values ($1, $2, $3, 'slate', $4)`,
    [id, actor.userId, name, deletedAt],
  );
  return id;
}

async function linkTag(userId: string, taskId: string, tagId: string) {
  await pool.query(`insert into task_tags (user_id, task_id, tag_id) values ($1, $2, $3)`, [
    userId,
    taskId,
    tagId,
  ]);
}

async function activeEquivalentTagCount(userId: string, normalizedName: string) {
  const result = await pool.query<{ count: string }>(
    `select count(*)::text as count
       from tags
      where user_id = $1 and deleted_at is null
        and lower(normalize(name, NFKC)) = lower(normalize($2, NFKC))`,
    [userId, normalizedName],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function storedTaskVersion(taskId: string) {
  const result = await pool.query<{ version: number }>(`select version from tasks where id = $1`, [taskId]);
  return result.rows[0]?.version;
}

async function storedTaskTagIds(userId: string, taskId: string) {
  const result = await pool.query<{ tag_id: string }>(
    `select tag_id from task_tags where user_id = $1 and task_id = $2 order by tag_id`,
    [userId, taskId],
  );
  return result.rows.map(({ tag_id }) => tag_id);
}
