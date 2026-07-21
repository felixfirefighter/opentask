import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readCommittedMigrationRevisions } from "../../shared/db/migration-files.ts";

import { applyMigrationSlice, createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const focusColumns = [
  "id",
  "user_id",
  "task_id",
  "habit_id",
  "kind",
  "mode",
  "state",
  "started_at",
  "paused_at",
  "accumulated_active_seconds",
  "planned_seconds",
  "ended_at",
  "version",
  "created_at",
  "updated_at",
] as const;

describe("P4 fresh Focus migration", () => {
  const fixture = createWp02SchemaFixture("p4_focus_fresh");
  let pool: Pool;

  beforeAll(async () => {
    pool = await fixture.setup();
  }, 60_000);

  afterAll(async () => fixture.teardown());

  it("creates only canonical session facts and no derived timer totals", async () => {
    const result = await pool.query<{ column_name: string }>(
      `select column_name
         from information_schema.columns
        where table_schema = current_schema() and table_name = 'focus_sessions'
        order by ordinal_position`,
    );
    expect(result.rows.map(({ column_name }) => column_name)).toEqual(focusColumns);
    expect(result.rows.map(({ column_name }) => column_name)).not.toEqual(
      expect.arrayContaining(["today_total", "remaining_seconds", "overtime_seconds", "tick"]),
    );
  });

  it("installs the unfinished uniqueness, history, and tenant-leading link indexes", async () => {
    const result = await pool.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef
         from pg_indexes
        where schemaname = current_schema() and tablename = 'focus_sessions'
        order by indexname`,
    );
    expect(result.rows.map(({ indexname }) => indexname)).toEqual([
      "focus_sessions_completed_history_idx",
      "focus_sessions_habit_owner_idx",
      "focus_sessions_one_unfinished_per_user_idx",
      "focus_sessions_pkey",
      "focus_sessions_task_owner_idx",
    ]);
    expect(result.rows.find(({ indexname }) => indexname.includes("one_unfinished"))?.indexdef).toContain(
      "WHERE (state = ANY (ARRAY['active'::text, 'paused'::text]))",
    );
    expect(result.rows.find(({ indexname }) => indexname.includes("completed_history"))?.indexdef).toContain(
      "(user_id, ended_at DESC NULLS LAST, id DESC NULLS LAST)",
    );
  });

  it("uses composite task and habit ownership foreign keys", async () => {
    const result = await pool.query<{ name: string; columns: string[] }>(
      `select constraint_record.conname as name,
              array_agg(attribute.attname::text order by key.ordinality) as columns
         from pg_constraint constraint_record
         join pg_class table_record on table_record.oid = constraint_record.conrelid
         join pg_namespace namespace_record on namespace_record.oid = table_record.relnamespace
         cross join lateral unnest(constraint_record.conkey)
           with ordinality as key(attnum, ordinality)
         join pg_attribute attribute
           on attribute.attrelid = table_record.oid and attribute.attnum = key.attnum
        where namespace_record.nspname = current_schema()
          and table_record.relname = 'focus_sessions'
          and constraint_record.contype = 'f'
        group by constraint_record.conname
        order by constraint_record.conname`,
    );
    expect(result.rows).toEqual([
      { name: "focus_sessions_habit_owner_fk", columns: ["user_id", "habit_id"] },
      { name: "focus_sessions_task_owner_fk", columns: ["user_id", "task_id"] },
      { name: "focus_sessions_user_id_user_id_fk", columns: ["user_id"] },
    ]);
  });
});

describe("P4 populated upgrade migration", () => {
  const fixture = createWp02SchemaFixture("p4_focus_upgrade");
  let pool: Pool;

  beforeAll(async () => {
    pool = await fixture.setup({ migrateLatest: false });
    const revisions = readCommittedMigrationRevisions();
    const p4Index = revisions.findIndex(({ sql }) =>
      sql.some((statement) => statement.includes('CREATE TABLE "focus_sessions"')),
    );
    expect(p4Index).toBe(14);
    await applyMigrationSlice(pool, 0, p4Index);
  }, 60_000);

  afterAll(async () => fixture.teardown());

  it("preserves existing tasks and habits while adding an empty Focus aggregate", async () => {
    const userId = await insertUser(pool, "p4-upgrade-owner");
    const listId = randomUUID();
    const taskId = randomUUID();
    const habitId = randomUUID();
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
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into habits (id, user_id, title, icon, color_token, goal_kind)
         values ($1, $2, 'Existing habit', 'H', 'mint', 'boolean')`,
        [habitId, userId],
      );
      await client.query(
        `insert into habit_schedules (user_id, habit_id, kind, timezone, start_date)
         values ($1, $2, 'daily', 'UTC', '2026-07-01')`,
        [userId, habitId],
      );
      await client.query("commit");
    } finally {
      client.release();
    }

    await applyMigrationSlice(pool, 14, 15);

    await expect(
      pool.query<{ title: string }>(`select title from tasks where user_id = $1 and id = $2`, [
        userId,
        taskId,
      ]),
    ).resolves.toMatchObject({ rows: [{ title: "Existing task" }] });
    await expect(
      pool.query<{ title: string }>(`select title from habits where user_id = $1 and id = $2`, [
        userId,
        habitId,
      ]),
    ).resolves.toMatchObject({ rows: [{ title: "Existing habit" }] });
    await expect(
      pool.query<{ count: number }>(`select count(*)::int as count from focus_sessions where user_id = $1`, [
        userId,
      ]),
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
  });
});
