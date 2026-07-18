import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readCommittedMigrationRevisions } from "../../shared/db/migration-files.ts";

import { applyMigrationSlice, createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("actor-identity-upgrade");
let pool: Pool;

describe("WP02 actor-scoped identity migration", () => {
  beforeAll(async () => {
    pool = await fixture.setup({ migrateLatest: false });
  });

  afterAll(async () => fixture.teardown());

  it("preserves a populated 0007 ownership graph while replacing global primary keys", async () => {
    const revisions = readCommittedMigrationRevisions();
    const actorIdentityRevision = revisions.findIndex((revision) =>
      revision.sql.some((statement) => statement.includes('ADD CONSTRAINT "list_folders_pkey" PRIMARY KEY')),
    );
    expect(actorIdentityRevision).toBeGreaterThan(0);
    await applyMigrationSlice(pool, 0, actorIdentityRevision);

    const userId = await insertUser(pool, "actor-identity-upgrade");
    const ids = await insertPopulatedGraph(userId);
    const before = await readGraph(userId);

    await applyMigrationSlice(pool, actorIdentityRevision, actorIdentityRevision + 1);

    await expect(readGraph(userId)).resolves.toEqual(before);
    const parentConstraint = await pool.query<{ condeferrable: boolean; condeferred: boolean }>(
      `select condeferrable, condeferred
         from pg_constraint
        where conrelid = 'tasks'::regclass
          and conname = 'tasks_parent_owner_list_fk'`,
    );
    expect(parentConstraint.rows).toEqual([{ condeferrable: true, condeferred: true }]);

    const secondUserId = await insertUser(pool, "actor-identity-upgrade-second");
    await expect(
      pool.query(
        `insert into list_folders (id, user_id, name, rank)
         values ($1, $2, 'Same UUID after upgrade', 'a0')`,
        [ids.folder, secondUserId],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
  });
});

async function insertPopulatedGraph(userId: string) {
  const ids = {
    folder: randomUUID(),
    list: randomUUID(),
    section: randomUUID(),
    rootTask: randomUUID(),
    subtask: randomUUID(),
    checklist: randomUUID(),
    tag: randomUUID(),
  };
  await pool.query(
    `insert into list_folders (id, user_id, name, rank)
     values ($1, $2, 'Upgrade folder', 'a0')`,
    [ids.folder, userId],
  );
  await pool.query(
    `insert into task_lists (id, user_id, folder_id, name, color_token, rank, kind)
     values ($1, $2, $3, 'Upgrade list', 'slate', 'a0', 'regular')`,
    [ids.list, userId, ids.folder],
  );
  await pool.query(
    `insert into list_sections (id, user_id, list_id, name, rank)
     values ($1, $2, $3, 'Upgrade section', 'a0')`,
    [ids.section, userId, ids.list],
  );
  await pool.query(
    `insert into tasks (id, user_id, list_id, section_id, title, description_md, rank)
     values ($1, $2, $3, $4, 'Upgrade root', '', 'a0')`,
    [ids.rootTask, userId, ids.list, ids.section],
  );
  await pool.query(
    `insert into tasks (id, user_id, list_id, parent_task_id, title, description_md, rank)
     values ($1, $2, $3, $4, 'Upgrade subtask', '', 'a0')`,
    [ids.subtask, userId, ids.list, ids.rootTask],
  );
  await pool.query(
    `insert into checklist_items (id, user_id, task_id, title, rank)
     values ($1, $2, $3, 'Upgrade checklist', 'a0')`,
    [ids.checklist, userId, ids.rootTask],
  );
  await pool.query(
    `insert into tags (id, user_id, name, color_token)
     values ($1, $2, 'Upgrade tag', 'slate')`,
    [ids.tag, userId],
  );
  await pool.query(`insert into task_tags (user_id, task_id, tag_id) values ($1, $2, $3)`, [
    userId,
    ids.rootTask,
    ids.tag,
  ]);
  return ids;
}

async function readGraph(userId: string) {
  const [folders, lists, sections, tasks, checklist, tags, taskTags] = await Promise.all([
    pool.query(`select id, user_id, name, rank, version, deleted_at from list_folders where user_id = $1`, [
      userId,
    ]),
    pool.query(
      `select id, user_id, folder_id, name, rank, version, deleted_at from task_lists where user_id = $1`,
      [userId],
    ),
    pool.query(`select id, user_id, list_id, name, rank, version from list_sections where user_id = $1`, [
      userId,
    ]),
    pool.query(
      `select id, user_id, list_id, section_id, parent_task_id, title, rank, version, deleted_at
         from tasks where user_id = $1 order by title`,
      [userId],
    ),
    pool.query(`select id, user_id, task_id, title, rank, version from checklist_items where user_id = $1`, [
      userId,
    ]),
    pool.query(`select id, user_id, name, version, deleted_at from tags where user_id = $1`, [userId]),
    pool.query(`select user_id, task_id, tag_id from task_tags where user_id = $1`, [userId]),
  ]);
  return {
    folders: folders.rows,
    lists: lists.rows,
    sections: sections.rows,
    tasks: tasks.rows,
    checklist: checklist.rows,
    tags: tags.rows,
    taskTags: taskTags.rows,
  };
}
