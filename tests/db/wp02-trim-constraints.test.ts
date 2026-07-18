import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createWp02SchemaFixture, expectPostgresError, insertUser } from "./wp02-schema-support.ts";

const ecmaScriptTrimCharacters = [
  "\u0009",
  "\u000a",
  "\u000b",
  "\u000c",
  "\u000d",
  "\u0020",
  "\u00a0",
  "\u1680",
  "\u2000",
  "\u2001",
  "\u2002",
  "\u2003",
  "\u2004",
  "\u2005",
  "\u2006",
  "\u2007",
  "\u2008",
  "\u2009",
  "\u200a",
  "\u2028",
  "\u2029",
  "\u202f",
  "\u205f",
  "\u3000",
  "\ufeff",
] as const;

const fixture = createWp02SchemaFixture("trim-constraints");
const ids = {
  folder: randomUUID(),
  list: randomUUID(),
  section: randomUUID(),
  task: randomUUID(),
  checklist: randomUUID(),
  tag: randomUUID(),
};
let pool: Pool;

describe("WP02 ECMAScript trim constraints", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    const userId = await insertUser(pool, "trim-constraints");
    await pool.query(
      `insert into list_folders (id, user_id, name, rank)
       values ($1, $2, 'Folder', 'a0')`,
      [ids.folder, userId],
    );
    await pool.query(
      `insert into task_lists (id, user_id, folder_id, name, color_token, rank, kind)
       values ($1, $2, $3, 'List', 'slate', 'a0', 'regular')`,
      [ids.list, userId, ids.folder],
    );
    await pool.query(
      `insert into list_sections (id, user_id, list_id, name, rank)
       values ($1, $2, $3, 'Section', 'a0')`,
      [ids.section, userId, ids.list],
    );
    await pool.query(
      `insert into tasks (id, user_id, list_id, section_id, title, description_md, rank)
       values ($1, $2, $3, $4, 'Task', '', 'a0')`,
      [ids.task, userId, ids.list, ids.section],
    );
    await pool.query(
      `insert into checklist_items (id, user_id, task_id, title, rank)
       values ($1, $2, $3, 'Checklist', 'a0')`,
      [ids.checklist, userId, ids.task],
    );
    await pool.query(
      `insert into tags (id, user_id, name, color_token)
       values ($1, $2, 'Tag', 'slate')`,
      [ids.tag, userId],
    );
  });

  afterAll(async () => fixture.teardown());

  it("rejects every ECMAScript trim character at a required-text boundary", async () => {
    for (const boundary of ecmaScriptTrimCharacters) {
      await expectPostgresError(
        pool.query(`update tasks set title = $1 where id = $2`, [`${boundary}Task`, ids.task]),
        "23514",
      );
      await expectPostgresError(
        pool.query(`update tasks set title = $1 where id = $2`, [`Task${boundary}`, ids.task]),
        "23514",
      );
    }
  });

  it("applies ASCII-control and Unicode boundary checks to every required name, title, and rank", async () => {
    const fields = persistedRequiredFields();
    for (const boundary of ["\u0009", "\u3000"] as const) {
      for (const field of fields) {
        await expectPostgresError(field.write(`${boundary}${field.valid}`), "23514");
        await expectPostgresError(field.write(`${field.valid}${boundary}`), "23514");
      }
    }
  });

  it("keeps boundary trimming distinct from interior text and preserves character limits", async () => {
    await expect(
      pool.query(`update tasks set title = $1 where id = $2`, ["Task\twith\u3000space", ids.task]),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      pool.query(`update tasks set title = $1 where id = $2`, ["\u180eTask\u180e", ids.task]),
    ).resolves.toMatchObject({ rowCount: 1 });

    await expect(
      pool.query(`update list_folders set name = $1 where id = $2`, ["n".repeat(120), ids.folder]),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expectPostgresError(
      pool.query(`update list_folders set name = $1 where id = $2`, ["n".repeat(121), ids.folder]),
      "23514",
    );
    await expect(
      pool.query(`update tasks set title = $1 where id = $2`, ["😀".repeat(500), ids.task]),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expectPostgresError(
      pool.query(`update tasks set title = $1 where id = $2`, ["😀".repeat(501), ids.task]),
      "23514",
    );
    await expect(
      pool.query(`update list_folders set rank = $1 where id = $2`, ["r".repeat(128), ids.folder]),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expectPostgresError(
      pool.query(`update list_folders set rank = $1 where id = $2`, ["r".repeat(129), ids.folder]),
      "23514",
    );
  });
});

function persistedRequiredFields() {
  return [
    field("Folder", (value) =>
      pool.query(`update list_folders set name = $1 where id = $2`, [value, ids.folder]),
    ),
    field("a0", (value) =>
      pool.query(`update list_folders set rank = $1 where id = $2`, [value, ids.folder]),
    ),
    field("List", (value) => pool.query(`update task_lists set name = $1 where id = $2`, [value, ids.list])),
    field("a0", (value) => pool.query(`update task_lists set rank = $1 where id = $2`, [value, ids.list])),
    field("Section", (value) =>
      pool.query(`update list_sections set name = $1 where id = $2`, [value, ids.section]),
    ),
    field("a0", (value) =>
      pool.query(`update list_sections set rank = $1 where id = $2`, [value, ids.section]),
    ),
    field("Task", (value) => pool.query(`update tasks set title = $1 where id = $2`, [value, ids.task])),
    field("a0", (value) => pool.query(`update tasks set rank = $1 where id = $2`, [value, ids.task])),
    field("Checklist", (value) =>
      pool.query(`update checklist_items set title = $1 where id = $2`, [value, ids.checklist]),
    ),
    field("a0", (value) =>
      pool.query(`update checklist_items set rank = $1 where id = $2`, [value, ids.checklist]),
    ),
    field("Tag", (value) => pool.query(`update tags set name = $1 where id = $2`, [value, ids.tag])),
  ];
}

function field(valid: string, write: (value: string) => Promise<unknown>) {
  return { valid, write };
}
