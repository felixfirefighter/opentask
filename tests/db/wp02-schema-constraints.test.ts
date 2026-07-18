import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createWp02SchemaFixture, expectPostgresError, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("constraints");
let pool: Pool;

describe("WP02 database constraints", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
  });

  afterAll(async () => fixture.teardown());

  it("rejects cross-owner and cross-list nested relationships", async () => {
    const ownerA = await insertUser(pool, "constraints-a");
    const ownerB = await insertUser(pool, "constraints-b");
    const folderA = await insertFolder(ownerA, "Folder A");
    const folderB = await insertFolder(ownerB, "Folder B");
    const listA = await insertList(ownerA, folderA, "List A");
    const otherListA = await insertList(ownerA, folderA, "List A other");
    const listB = await insertList(ownerB, folderB, "List B");

    await expectPostgresError(insertList(ownerA, folderB, "Cross-owner list"), "23503");

    const sectionA = await insertSection(ownerA, listA, "Section A");
    const sectionB = await insertSection(ownerB, listB, "Section B");
    await expectPostgresError(insertSection(ownerA, listB, "Cross-owner section"), "23503");

    const taskA = await insertTask(ownerA, listA, { sectionId: sectionA, title: "Task A" });
    const taskB = await insertTask(ownerB, listB, { sectionId: sectionB, title: "Task B" });
    await expectPostgresError(
      insertTask(ownerA, listA, { sectionId: sectionB, title: "Cross-list section" }),
      "23503",
    );
    await expectPostgresError(
      insertTask(ownerA, listA, { parentTaskId: taskB, title: "Cross-owner parent" }),
      "23503",
    );
    await expectPostgresError(
      insertTask(ownerA, otherListA, { parentTaskId: taskA, title: "Cross-list parent" }),
      "23503",
    );

    const tagB = await insertTag(ownerB, "Owner B tag");
    await expectPostgresError(
      pool.query(`insert into task_tags (user_id, task_id, tag_id) values ($1, $2, $3)`, [
        ownerA,
        taskA,
        tagB,
      ]),
      "23503",
    );
    await expectPostgresError(
      pool.query(
        `insert into checklist_items (id, user_id, task_id, title, rank)
         values ($1, $2, $3, 'Cross-owner item', 'a0')`,
        [randomUUID(), ownerA, taskB],
      ),
      "23503",
    );
  });

  it("enforces scalar bounds, enums, immutable Inbox placement, and normalized active tags", async () => {
    const userId = await insertUser(pool, "scalar-checks");
    const folderId = await insertFolder(userId, "Folder");
    const listId = await insertList(userId, folderId, "Regular list");

    await expectPostgresError(
      pool.query(
        `insert into task_lists (id, user_id, folder_id, name, color_token, rank, kind)
         values ($1, $2, $3, 'Inbox', 'slate', 'a0', 'inbox')`,
        [randomUUID(), userId, folderId],
      ),
      "23514",
    );
    await expectPostgresError(insertFolder(userId, " padded"), "23514");
    await expectPostgresError(
      pool.query(
        `insert into task_lists (id, user_id, name, color_token, rank, kind)
         values ($1, $2, 'Bad color', 'red', 'a0', 'regular')`,
        [randomUUID(), userId],
      ),
      "23514",
    );
    await expectPostgresError(
      insertTask(userId, listId, { title: "Invalid status", status: "blocked" }),
      "23514",
    );
    await expectPostgresError(insertTask(userId, listId, { title: " ", status: "open" }), "23514");
    await expectPostgresError(
      insertTask(userId, listId, { title: "Oversized description", descriptionMd: "x".repeat(20_001) }),
      "23514",
    );

    const selfId = randomUUID();
    await expectPostgresError(
      pool.query(
        `insert into tasks (id, user_id, list_id, parent_task_id, title, description_md, rank)
         values ($1, $2, $3, $1, 'Self parent', '', 'a0')`,
        [selfId, userId, listId],
      ),
      "23514",
    );

    const displayName = "Ｆｏｃｕｓ";
    const displayTagId = await insertTag(userId, displayName);
    await expectPostgresError(insertTag(userId, "focus"), "23505");
    await expect(pool.query(`select name from tags where id = $1`, [displayTagId])).resolves.toMatchObject({
      rows: [{ name: displayName }],
    });
    await pool.query(`update tags set deleted_at = now() where id = $1`, [displayTagId]);
    await expect(insertTag(userId, "focus")).resolves.toEqual(expect.any(String));
  });

  it("cascades an account purge through the complete WP02 ownership graph", async () => {
    const userId = await insertUser(pool, "cascade-owner");
    const folderId = await insertFolder(userId, "Cascade folder");
    const listId = await insertList(userId, folderId, "Cascade list");
    const sectionId = await insertSection(userId, listId, "Cascade section");
    const taskId = await insertTask(userId, listId, { sectionId, title: "Cascade task" });
    const tagId = await insertTag(userId, "Cascade tag");
    await pool.query(`insert into task_tags (user_id, task_id, tag_id) values ($1, $2, $3)`, [
      userId,
      taskId,
      tagId,
    ]);
    await pool.query(
      `insert into checklist_items (id, user_id, task_id, title, rank)
       values ($1, $2, $3, 'Cascade item', 'a0')`,
      [randomUUID(), userId, taskId],
    );

    await pool.query(`delete from "user" where id = $1`, [userId]);
    for (const table of [
      "list_folders",
      "task_lists",
      "list_sections",
      "tasks",
      "checklist_items",
      "tags",
      "task_tags",
    ]) {
      const result = await pool.query(`select count(*)::integer as count from ${table} where user_id = $1`, [
        userId,
      ]);
      expect(result.rows).toEqual([{ count: 0 }]);
    }
  });
});

async function insertFolder(userId: string, name: string) {
  const id = randomUUID();
  await pool.query(`insert into list_folders (id, user_id, name, rank) values ($1, $2, $3, 'a0')`, [
    id,
    userId,
    name,
  ]);
  return id;
}

async function insertList(userId: string, folderId: string | null, name: string) {
  const id = randomUUID();
  await pool.query(
    `insert into task_lists (id, user_id, folder_id, name, color_token, rank, kind)
     values ($1, $2, $3, $4, 'slate', 'a0', 'regular')`,
    [id, userId, folderId, name],
  );
  return id;
}

async function insertSection(userId: string, listId: string, name: string) {
  const id = randomUUID();
  await pool.query(
    `insert into list_sections (id, user_id, list_id, name, rank) values ($1, $2, $3, $4, 'a0')`,
    [id, userId, listId, name],
  );
  return id;
}

async function insertTask(
  userId: string,
  listId: string,
  input: {
    title: string;
    sectionId?: string;
    parentTaskId?: string;
    descriptionMd?: string;
    status?: string;
  },
) {
  const id = randomUUID();
  await pool.query(
    `insert into tasks
       (id, user_id, list_id, section_id, parent_task_id, title, description_md, status, rank)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'a0')`,
    [
      id,
      userId,
      listId,
      input.sectionId ?? null,
      input.parentTaskId ?? null,
      input.title,
      input.descriptionMd ?? "",
      input.status ?? "open",
    ],
  );
  return id;
}

async function insertTag(userId: string, name: string) {
  const id = randomUUID();
  await pool.query(`insert into tags (id, user_id, name, color_token) values ($1, $2, $3, 'slate')`, [
    id,
    userId,
    name,
  ]);
  return id;
}
