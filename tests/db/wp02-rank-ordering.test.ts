import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("rank_ordering");
let pool: Pool;

describe("WP02 persisted rank ordering", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
  });

  afterAll(async () => fixture.teardown());

  it("orders fractional keys bytewise in every persisted rank scope", async () => {
    const userId = await insertUser(pool, "rank-owner");
    const folderZ = randomUUID();
    const folderA = randomUUID();
    await pool.query(
      `insert into list_folders (id, user_id, name, rank)
       values ($1, $3, 'Folder Z', 'Zz'), ($2, $3, 'Folder A', 'a0')`,
      [folderZ, folderA, userId],
    );
    await expectOrder(`select name from list_folders where user_id = $1 order by rank, id`, userId, [
      "Folder Z",
      "Folder A",
    ]);

    const listZ = randomUUID();
    const listA = randomUUID();
    await pool.query(
      `insert into task_lists (id, user_id, name, color_token, rank, kind)
       values ($1, $3, 'List Z', 'slate', 'Zz', 'regular'),
              ($2, $3, 'List A', 'slate', 'a0', 'regular')`,
      [listZ, listA, userId],
    );
    await expectOrder(
      `select name from task_lists
        where user_id = $1 and folder_id is null
        order by rank, id`,
      userId,
      ["List Z", "List A"],
    );

    const sectionZ = randomUUID();
    const sectionA = randomUUID();
    await pool.query(
      `insert into list_sections (id, user_id, list_id, name, rank)
       values ($1, $3, $4, 'Section Z', 'Zz'), ($2, $3, $4, 'Section A', 'a0')`,
      [sectionZ, sectionA, userId, listZ],
    );
    await expectOrder(
      `select name from list_sections where user_id = $1 and list_id = $2 order by rank, id`,
      [userId, listZ],
      ["Section Z", "Section A"],
    );

    const taskZ = randomUUID();
    const taskA = randomUUID();
    await pool.query(
      `insert into tasks (id, user_id, list_id, title, description_md, rank)
       values ($1, $3, $4, 'Task Z', '', 'Zz'), ($2, $3, $4, 'Task A', '', 'a0')`,
      [taskZ, taskA, userId, listZ],
    );
    await expectOrder(
      `select title as name from tasks
        where user_id = $1 and list_id = $2 and parent_task_id is null and section_id is null
        order by rank, id`,
      [userId, listZ],
      ["Task Z", "Task A"],
    );

    await pool.query(
      `insert into checklist_items (id, user_id, task_id, title, rank)
       values ($1, $3, $4, 'Item Z', 'Zz'), ($2, $3, $4, 'Item A', 'a0')`,
      [randomUUID(), randomUUID(), userId, taskZ],
    );
    await expectOrder(
      `select title as name from checklist_items
        where user_id = $1 and task_id = $2
        order by rank, id`,
      [userId, taskZ],
      ["Item Z", "Item A"],
    );
  });
});

async function expectOrder(query: string, parameters: string | readonly string[], expected: string[]) {
  const values = typeof parameters === "string" ? [parameters] : parameters;
  const result = await pool.query<{ name: string }>(query, [...values]);
  expect(result.rows.map(({ name }) => name)).toEqual(expected);
}
