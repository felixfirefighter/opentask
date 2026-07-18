import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createWp02SchemaFixture, expectPostgresError, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("actor-scoped-identities");
const sharedIds = {
  folder: randomUUID(),
  list: randomUUID(),
  section: randomUUID(),
  task: randomUUID(),
  checklist: randomUUID(),
  tag: randomUUID(),
};
let pool: Pool;

describe("WP02 actor-scoped aggregate identities", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
  });

  afterAll(async () => fixture.teardown());

  it("allows two users to own the same aggregate UUIDs with independently scoped relationships", async () => {
    const userA = await insertUser(pool, "actor-identities-a");
    const userB = await insertUser(pool, "actor-identities-b");
    await insertTaskGraph(userA, "A");
    await insertTaskGraph(userB, "B");

    for (const [tableName, id] of [
      ["list_folders", sharedIds.folder],
      ["task_lists", sharedIds.list],
      ["list_sections", sharedIds.section],
      ["tasks", sharedIds.task],
      ["checklist_items", sharedIds.checklist],
      ["tags", sharedIds.tag],
    ] as const) {
      const result = await pool.query<{ user_id: string }>(
        `select user_id from ${tableName} where id = $1 order by user_id`,
        [id],
      );
      expect(result.rows).toEqual([userA, userB].sort().map((user_id) => ({ user_id })));
    }

    const joins = await pool.query<{ user_id: string; task_id: string; tag_id: string }>(
      `select user_id, task_id, tag_id
         from task_tags
        where task_id = $1 and tag_id = $2
        order by user_id`,
      [sharedIds.task, sharedIds.tag],
    );
    expect(joins.rows).toEqual(
      [userA, userB].sort().map((user_id) => ({
        user_id,
        task_id: sharedIds.task,
        tag_id: sharedIds.tag,
      })),
    );

    await expectPostgresError(
      pool.query(
        `insert into list_folders (id, user_id, name, rank)
         values ($1, $2, 'Duplicate in one actor', 'a0')`,
        [sharedIds.folder, userA],
      ),
      "23505",
    );

    await pool.query(`delete from "user" where id = $1`, [userA]);
    for (const [tableName, id] of [
      ["list_folders", sharedIds.folder],
      ["task_lists", sharedIds.list],
      ["list_sections", sharedIds.section],
      ["tasks", sharedIds.task],
      ["checklist_items", sharedIds.checklist],
      ["tags", sharedIds.tag],
    ] as const) {
      const result = await pool.query<{ user_id: string }>(`select user_id from ${tableName} where id = $1`, [
        id,
      ]);
      expect(result.rows).toEqual([{ user_id: userB }]);
    }
    await expect(
      pool.query(`select user_id from task_tags where task_id = $1 and tag_id = $2`, [
        sharedIds.task,
        sharedIds.tag,
      ]),
    ).resolves.toMatchObject({ rows: [{ user_id: userB }] });
  });
});

async function insertTaskGraph(userId: string, label: string) {
  await pool.query(
    `insert into list_folders (id, user_id, name, rank)
     values ($1, $2, $3, 'a0')`,
    [sharedIds.folder, userId, `Folder ${label}`],
  );
  await pool.query(
    `insert into task_lists (id, user_id, folder_id, name, color_token, rank, kind)
     values ($1, $2, $3, $4, 'slate', 'a0', 'regular')`,
    [sharedIds.list, userId, sharedIds.folder, `List ${label}`],
  );
  await pool.query(
    `insert into list_sections (id, user_id, list_id, name, rank)
     values ($1, $2, $3, $4, 'a0')`,
    [sharedIds.section, userId, sharedIds.list, `Section ${label}`],
  );
  await pool.query(
    `insert into tasks (id, user_id, list_id, section_id, title, description_md, rank)
     values ($1, $2, $3, $4, $5, '', 'a0')`,
    [sharedIds.task, userId, sharedIds.list, sharedIds.section, `Task ${label}`],
  );
  await pool.query(
    `insert into checklist_items (id, user_id, task_id, title, rank)
     values ($1, $2, $3, $4, 'a0')`,
    [sharedIds.checklist, userId, sharedIds.task, `Checklist ${label}`],
  );
  await pool.query(
    `insert into tags (id, user_id, name, color_token)
     values ($1, $2, $3, 'slate')`,
    [sharedIds.tag, userId, `Tag ${label}`],
  );
  await pool.query(`insert into task_tags (user_id, task_id, tag_id) values ($1, $2, $3)`, [
    userId,
    sharedIds.task,
    sharedIds.tag,
  ]);
}
