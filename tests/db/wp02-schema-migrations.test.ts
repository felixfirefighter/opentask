import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readCommittedMigrationRevisions } from "../../shared/db/migration-files.ts";

import { applyMigrationSlice, createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const taskColumns = {
  checklist_items: [
    "id",
    "user_id",
    "task_id",
    "title",
    "is_completed",
    "rank",
    "version",
    "created_at",
    "updated_at",
  ],
  list_folders: ["id", "user_id", "name", "rank", "version", "created_at", "updated_at", "deleted_at"],
  list_sections: ["id", "user_id", "list_id", "name", "rank", "version", "created_at", "updated_at"],
  tags: ["id", "user_id", "name", "color_token", "version", "created_at", "updated_at", "deleted_at"],
  task_lists: [
    "id",
    "user_id",
    "name",
    "color_token",
    "rank",
    "kind",
    "version",
    "created_at",
    "updated_at",
    "deleted_at",
    "folder_id",
  ],
  task_tags: ["user_id", "task_id", "tag_id"],
  tasks: [
    "id",
    "user_id",
    "list_id",
    "section_id",
    "parent_task_id",
    "title",
    "description_md",
    "status",
    "priority",
    "rank",
    "status_changed_at",
    "version",
    "created_at",
    "updated_at",
    "deleted_at",
  ],
} as const;

describe("WP02 fresh schema inventory", () => {
  const fixture = createWp02SchemaFixture("fresh");
  let pool: Pool;

  beforeAll(async () => {
    pool = await fixture.setup();
  });

  afterAll(async () => fixture.teardown());

  it("creates exactly the approved WP02 task tables and columns", async () => {
    const result = await pool.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name
         from information_schema.columns
        where table_schema = current_schema()
          and table_name = any($1::text[])
        order by table_name, ordinal_position`,
      [Object.keys(taskColumns)],
    );
    const actual = Object.fromEntries(
      Object.keys(taskColumns).map((tableName) => [
        tableName,
        result.rows.filter((row) => row.table_name === tableName).map((row) => row.column_name),
      ]),
    );

    expect(actual).toEqual(taskColumns);
    for (const forbiddenColumn of ["due_at", "metadata", "is_completed"]) {
      expect(actual.tasks).not.toContain(forbiddenColumn);
    }
  });

  it("installs the exact ordering, lifecycle, ownership, and search indexes", async () => {
    const result = await pool.query<{ indexname: string }>(
      `select indexname
         from pg_indexes
        where schemaname = current_schema()
          and tablename = any($1::text[])
        order by indexname`,
      [Object.keys(taskColumns)],
    );

    expect(result.rows.map((row) => row.indexname)).toEqual(
      [
        "checklist_items_pkey",
        "checklist_items_task_owner_rank_idx",
        "list_folders_pkey",
        "list_folders_user_active_rank_idx",
        "list_sections_pkey",
        "list_sections_user_id_list_unique",
        "list_sections_user_list_rank_idx",
        "tags_name_search_idx",
        "tags_pkey",
        "tags_user_active_idx",
        "tags_user_active_normalized_name_idx",
        "task_lists_folder_owner_idx",
        "task_lists_one_active_inbox_per_user_idx",
        "task_lists_pkey",
        "task_lists_user_folder_active_rank_idx",
        "task_tags_pk",
        "task_tags_tag_owner_idx",
        "tasks_description_search_idx",
        "tasks_list_owner_idx",
        "tasks_parent_owner_list_idx",
        "tasks_pkey",
        "tasks_section_owner_list_idx",
        "tasks_title_search_idx",
        "tasks_user_active_rank_idx",
        "tasks_user_id_list_unique",
        "tasks_user_list_parent_active_rank_idx",
        "tasks_user_status_changed_idx",
      ].sort(),
    );

    const extension = await pool.query<{ schema_name: string }>(
      `select namespace.nspname as schema_name
         from pg_extension extension
         join pg_namespace namespace on namespace.oid = extension.extnamespace
        where extension.extname = 'pg_trgm'`,
    );
    expect(extension.rows).toEqual([{ schema_name: "public" }]);
  });

  it("uses actor-scoped primary keys and tenant-first support for every ownership foreign key", async () => {
    const actorScopedTables = [
      "checklist_items",
      "list_folders",
      "list_sections",
      "tags",
      "task_lists",
      "tasks",
    ];
    const primaryKeys = await pool.query<{ table_name: string; column_names: string[] }>(
      `select source_table.relname as table_name,
              array_agg(attribute.attname::text order by key.ordinality) as column_names
         from pg_constraint constraint_record
         join pg_class source_table on source_table.oid = constraint_record.conrelid
         join pg_namespace source_namespace on source_namespace.oid = source_table.relnamespace
         cross join lateral unnest(constraint_record.conkey)
           with ordinality as key(attnum, ordinality)
         join pg_attribute attribute
           on attribute.attrelid = constraint_record.conrelid
          and attribute.attnum = key.attnum
        where source_namespace.nspname = current_schema()
          and constraint_record.contype = 'p'
          and source_table.relname = any($1::text[])
        group by source_table.relname
        order by source_table.relname`,
      [actorScopedTables],
    );
    expect(primaryKeys.rows).toEqual(
      actorScopedTables.map((tableName) => ({ table_name: tableName, column_names: ["user_id", "id"] })),
    );

    const unsupportedForeignKeys = await pool.query<{ table_name: string; constraint_name: string }>(
      `select source_table.relname as table_name,
              constraint_record.conname as constraint_name
         from pg_constraint constraint_record
         join pg_class source_table on source_table.oid = constraint_record.conrelid
         join pg_namespace source_namespace on source_namespace.oid = source_table.relnamespace
        where source_namespace.nspname = current_schema()
          and constraint_record.contype = 'f'
          and source_table.relname = any($1::text[])
          and not exists (
                select 1
                  from pg_index index_record
                 where index_record.indrelid = constraint_record.conrelid
                   and index_record.indisvalid
                   and index_record.indpred is null
                   and (
                     select array_agg(index_key.attnum order by index_key.ordinality)
                       from unnest(index_record.indkey)
                         with ordinality as index_key(attnum, ordinality)
                      where index_key.ordinality <= cardinality(constraint_record.conkey)
                   ) = constraint_record.conkey
              )
        order by source_table.relname, constraint_record.conname`,
      [Object.keys(taskColumns)],
    );
    expect(unsupportedForeignKeys.rows).toEqual([]);
  });

  it("uses bytewise rank collation and a deferred same-list parent constraint", async () => {
    const rankColumns = await pool.query<{ table_name: string; collation_name: string }>(
      `select table_name, collation_name
         from information_schema.columns
        where table_schema = current_schema()
          and column_name = 'rank'
          and table_name = any($1::text[])
        order by table_name`,
      [["checklist_items", "list_folders", "list_sections", "task_lists", "tasks"]],
    );
    expect(rankColumns.rows).toEqual(
      ["checklist_items", "list_folders", "list_sections", "task_lists", "tasks"].map((tableName) => ({
        table_name: tableName,
        collation_name: "C",
      })),
    );

    const parentConstraint = await pool.query<{ condeferrable: boolean; condeferred: boolean }>(
      `select condeferrable, condeferred
         from pg_constraint
        where conrelid = 'tasks'::regclass
          and conname = 'tasks_parent_owner_list_fk'`,
    );
    expect(parentConstraint.rows).toEqual([{ condeferrable: true, condeferred: true }]);

    const subtaskRankIndex = await pool.query<{ column_names: string[]; predicate: string }>(
      `select array_agg(attribute.attname::text order by key.ordinality) as column_names,
              pg_get_expr(index_record.indpred, index_record.indrelid) as predicate
         from pg_index index_record
         join pg_class index_class on index_class.oid = index_record.indexrelid
         join pg_namespace index_namespace on index_namespace.oid = index_class.relnamespace
         cross join lateral unnest(index_record.indkey)
           with ordinality as key(attnum, ordinality)
         join pg_attribute attribute
           on attribute.attrelid = index_record.indrelid
          and attribute.attnum = key.attnum
        where index_namespace.nspname = current_schema()
          and index_class.relname = 'tasks_user_list_parent_active_rank_idx'
        group by index_record.indpred, index_record.indrelid`,
    );
    expect(subtaskRankIndex.rows).toEqual([
      {
        column_names: ["user_id", "list_id", "parent_task_id", "rank", "id"],
        predicate: "((parent_task_id IS NOT NULL) AND (deleted_at IS NULL))",
      },
    ]);
  });
});

describe("WP02 seeded WP01 upgrade", () => {
  const fixture = createWp02SchemaFixture("upgrade");
  let pool: Pool;

  beforeAll(async () => {
    pool = await fixture.setup({ migrateLatest: false });
  });

  afterAll(async () => fixture.teardown());

  it("preserves seeded WP01 Inboxes and resolves every new FK inside the isolated schema", async () => {
    const revisions = readCommittedMigrationRevisions();
    expect(revisions.length).toBeGreaterThan(4);
    await applyMigrationSlice(pool, 0, 4);

    const userA = await seedWp01Account(pool, "upgrade-a");
    const userB = await seedWp01Account(pool, "upgrade-b");
    const before = await pool.query(
      `select id, user_id, name, color_token, rank, kind, version, created_at, updated_at, deleted_at
         from task_lists order by user_id`,
    );

    await applyMigrationSlice(pool, 4, revisions.length);

    const after = await pool.query(
      `select id, user_id, name, color_token, rank, kind, version, created_at, updated_at, deleted_at
         from task_lists order by user_id`,
    );
    expect(after.rows).toEqual(before.rows);
    const folders = await pool.query("select folder_id from task_lists order by user_id");
    expect(folders.rows).toEqual([{ folder_id: null }, { folder_id: null }]);

    const targetSchemas = await pool.query<{ constraint_name: string; schema_name: string }>(
      `select constraint_record.conname as constraint_name, target_namespace.nspname as schema_name
         from pg_constraint constraint_record
         join pg_class source_table on source_table.oid = constraint_record.conrelid
         join pg_namespace source_namespace on source_namespace.oid = source_table.relnamespace
         join pg_class target_table on target_table.oid = constraint_record.confrelid
         join pg_namespace target_namespace on target_namespace.oid = target_table.relnamespace
        where source_namespace.nspname = current_schema()
          and constraint_record.contype = 'f'
          and source_table.relname = any($1::text[])
        order by constraint_record.conname`,
      [Object.keys(taskColumns)],
    );
    expect(targetSchemas.rows.length).toBeGreaterThan(10);
    expect(new Set(targetSchemas.rows.map((row) => row.schema_name))).toEqual(new Set([fixture.schemaName]));

    await pool.query(
      `insert into tasks (id, user_id, list_id, title, description_md, rank)
       values ($1, $2, $3, 'Upgraded task', '', 'a0')`,
      [randomUUID(), userA.userId, userA.inboxId],
    );
    expect(userB.inboxId).not.toBe(userA.inboxId);
  });
});

async function seedWp01Account(pool: Pool, label: string) {
  const userId = await insertUser(pool, label);
  const inboxId = randomUUID();
  await pool.query(
    `insert into user_preferences (user_id, schema_version, preferences)
     values ($1, 1, '{"timezone":"UTC","weekStart":1,"hourCycle":"h12","theme":"system","reducedMotion":false}'::jsonb)`,
    [userId],
  );
  await pool.query(
    `insert into task_lists (id, user_id, name, color_token, rank, kind)
     values ($1, $2, 'Inbox', 'slate', 'a0', 'inbox')`,
    [inboxId, userId],
  );
  return { userId, inboxId };
}
