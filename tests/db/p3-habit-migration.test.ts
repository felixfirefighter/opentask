import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readCommittedMigrationRevisions } from "../../shared/db/migration-files.ts";

import { applyMigrationSlice, createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const habitColumns = {
  habit_logs: [
    "id",
    "user_id",
    "habit_id",
    "local_date",
    "state",
    "quantity",
    "note",
    "version",
    "created_at",
    "updated_at",
  ],
  habit_schedules: [
    "user_id",
    "habit_id",
    "kind",
    "weekdays",
    "target_per_week",
    "timezone",
    "start_date",
    "end_date",
    "created_at",
    "updated_at",
  ],
  habits: [
    "id",
    "user_id",
    "title",
    "icon",
    "color_token",
    "goal_kind",
    "target_value",
    "unit",
    "version",
    "created_at",
    "updated_at",
    "archived_at",
  ],
} as const;

describe("P3 fresh habit migration", () => {
  const fixture = createWp02SchemaFixture("p3_habit_fresh");
  let pool: Pool;

  beforeAll(async () => {
    pool = await fixture.setup();
  }, 60_000);

  afterAll(async () => fixture.teardown());

  it("creates only the approved habit columns without stored projection counters", async () => {
    const result = await pool.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name
         from information_schema.columns
        where table_schema = current_schema()
          and table_name = any($1::text[])
        order by table_name, ordinal_position`,
      [Object.keys(habitColumns)],
    );
    const actual = Object.fromEntries(
      Object.keys(habitColumns).map((tableName) => [
        tableName,
        result.rows.filter((row) => row.table_name === tableName).map((row) => row.column_name),
      ]),
    );

    expect(actual).toEqual(habitColumns);
    expect(Object.values(actual).flat()).not.toEqual(
      expect.arrayContaining(["current_streak", "best_streak", "weekly_progress", "heat_map"]),
    );
  });

  it("installs actor-leading ownership, range, lifecycle, and uniqueness indexes", async () => {
    const result = await pool.query<{ indexname: string }>(
      `select indexname
         from pg_indexes
        where schemaname = current_schema()
          and tablename = any($1::text[])
        order by indexname`,
      [Object.keys(habitColumns)],
    );

    expect(result.rows.map(({ indexname }) => indexname)).toEqual(
      [
        "habit_logs_pkey",
        "habit_logs_user_habit_date_unique",
        "habit_logs_user_local_date_idx",
        "habit_schedules_pkey",
        "habit_schedules_user_dates_idx",
        "habits_pkey",
        "habits_user_active_updated_idx",
        "habits_user_archived_updated_idx",
      ].sort(),
    );

    const lifecyclePages = await pool.query<{
      index_name: string;
      columns: string[];
      definition: string;
      predicate: string;
    }>(
      `select index_class.relname as index_name,
              array_agg(
                pg_get_indexdef(index_record.indexrelid, key.ordinality::int, true)
                order by key.ordinality
              ) as columns,
              pg_get_indexdef(index_record.indexrelid) as definition,
              pg_get_expr(index_record.indpred, index_record.indrelid) as predicate
         from pg_index index_record
         join pg_class index_class on index_class.oid = index_record.indexrelid
         join pg_class table_class on table_class.oid = index_record.indrelid
         join pg_namespace table_namespace on table_namespace.oid = table_class.relnamespace
         cross join lateral generate_series(1, index_record.indnkeyatts) as key(ordinality)
        where table_namespace.nspname = current_schema()
          and index_class.relname = any($1::text[])
        group by index_record.indexrelid, index_record.indrelid, index_record.indpred, index_class.relname
        order by index_class.relname`,
      [["habits_user_active_updated_idx", "habits_user_archived_updated_idx"]],
    );
    expect(lifecyclePages.rows).toEqual([
      {
        index_name: "habits_user_active_updated_idx",
        columns: ["user_id", "updated_at", "id"],
        definition: expect.stringContaining("(user_id, updated_at DESC NULLS LAST, id)"),
        predicate: "(archived_at IS NULL)",
      },
      {
        index_name: "habits_user_archived_updated_idx",
        columns: ["user_id", "updated_at", "id"],
        definition: expect.stringContaining("(user_id, updated_at DESC NULLS LAST, id)"),
        predicate: "(archived_at IS NOT NULL)",
      },
    ]);

    const ownership = await pool.query<{ constraint_name: string; columns: string[] }>(
      `select constraint_record.conname as constraint_name,
              array_agg(attribute.attname::text order by key.ordinality) as columns
         from pg_constraint constraint_record
         join pg_class source_table on source_table.oid = constraint_record.conrelid
         join pg_namespace source_namespace on source_namespace.oid = source_table.relnamespace
         cross join lateral unnest(constraint_record.conkey)
           with ordinality as key(attnum, ordinality)
         join pg_attribute attribute
           on attribute.attrelid = source_table.oid and attribute.attnum = key.attnum
        where source_namespace.nspname = current_schema()
          and source_table.relname = any($1::text[])
          and constraint_record.contype = 'f'
        group by constraint_record.conname
        order by constraint_record.conname`,
      [Object.keys(habitColumns)],
    );
    expect(ownership.rows).toEqual([
      { constraint_name: "habit_logs_habit_owner_fk", columns: ["user_id", "habit_id"] },
      { constraint_name: "habit_logs_user_id_user_id_fk", columns: ["user_id"] },
      { constraint_name: "habit_schedules_habit_owner_fk", columns: ["user_id", "habit_id"] },
      { constraint_name: "habits_user_id_user_id_fk", columns: ["user_id"] },
    ]);
  });

  it("installs deferred exactly-one-schedule and goal-shape enforcement", async () => {
    const triggers = await pool.query<{ trigger_name: string; deferred: boolean }>(
      `select trigger_record.tgname as trigger_name,
              trigger_record.tginitdeferred as deferred
         from pg_trigger trigger_record
         join pg_class table_record on table_record.oid = trigger_record.tgrelid
         join pg_namespace namespace_record on namespace_record.oid = table_record.relnamespace
        where namespace_record.nspname = current_schema()
          and trigger_record.tgname = any($1::text[])
        order by trigger_record.tgname`,
      [
        [
          "habit_logs_validate_goal_shape_trigger",
          "habit_schedules_prevent_orphan_trigger",
          "habits_require_schedule_trigger",
        ],
      ],
    );
    expect(triggers.rows).toEqual([
      { trigger_name: "habit_logs_validate_goal_shape_trigger", deferred: false },
      { trigger_name: "habit_schedules_prevent_orphan_trigger", deferred: true },
      { trigger_name: "habits_require_schedule_trigger", deferred: true },
    ]);
  });
});

describe("P3 populated upgrade migration", () => {
  const fixture = createWp02SchemaFixture("p3_habit_upgrade");
  let pool: Pool;

  beforeAll(async () => {
    pool = await fixture.setup({ migrateLatest: false });
    const revisions = readCommittedMigrationRevisions();
    const p3Index = revisions.findIndex(({ sql }) =>
      sql.some((statement) => statement.includes('CREATE TABLE "habit_logs"')),
    );
    expect(p3Index).toBe(13);
    await applyMigrationSlice(pool, 0, p3Index);
  }, 60_000);

  afterAll(async () => fixture.teardown());

  it("preserves existing owned task data while adding an empty habit aggregate", async () => {
    const userId = await insertUser(pool, "p3-upgrade-owner");
    const listId = randomUUID();
    const taskId = randomUUID();
    await pool.query(
      `insert into task_lists (id, user_id, name, color_token, rank, kind)
       values ($1, $2, 'Existing list', 'slate', 'a0', 'regular')`,
      [listId, userId],
    );
    await pool.query(
      `insert into tasks (id, user_id, list_id, title, description_md, rank)
       values ($1, $2, $3, 'Existing task', '', 'a0')`,
      [taskId, userId, listId],
    );

    await applyMigrationSlice(pool, 13, 14);

    const preserved = await pool.query<{ title: string }>(
      `select title from tasks where user_id = $1 and id = $2`,
      [userId, taskId],
    );
    const habitCount = await pool.query<{ count: number }>(
      `select count(*)::int as count from habits where user_id = $1`,
      [userId],
    );
    expect(preserved.rows).toEqual([{ title: "Existing task" }]);
    expect(habitCount.rows).toEqual([{ count: 0 }]);
  });
});
