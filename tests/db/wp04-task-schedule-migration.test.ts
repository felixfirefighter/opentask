import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readCommittedMigrationRevisions } from "../../shared/db/migration-files.ts";

import { applyMigrationSlice, createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("task_schedule_upgrade");
let pool: Pool;
let userId: string;
let taskId: string;

describe("task schedule migration", () => {
  beforeAll(async () => {
    const revisions = readCommittedMigrationRevisions();
    const scheduleRevision = revisions.findIndex((revision) =>
      revision.sql.some((statement) => statement.includes('CREATE TABLE "task_schedules"')),
    );
    expect(scheduleRevision).toBeGreaterThan(0);
    pool = await fixture.setup({ migrateLatest: false });
    await applyMigrationSlice(pool, 0, scheduleRevision);

    userId = await insertUser(pool, "schedule-upgrade-owner");
    const listId = randomUUID();
    taskId = randomUUID();
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

    const before = await pool.query(`select to_regclass('task_schedules') as table_name`);
    expect(before.rows[0]?.table_name).toBeNull();
    await applyMigrationSlice(pool, scheduleRevision, scheduleRevision + 1);
  });

  afterAll(async () => fixture.teardown());

  it("upgrades populated task data without rewriting the owning task", async () => {
    const task = await pool.query(`select title, version from tasks where user_id = $1 and id = $2`, [
      userId,
      taskId,
    ]);
    expect(task.rows).toEqual([{ title: "Existing task", version: 1 }]);

    await pool.query(
      `insert into task_schedules (user_id, task_id, kind, start_at, end_at, timezone)
       values ($1, $2, 'timed', '2026-07-20T01:00:00Z', '2026-07-20T01:00:00Z', 'UTC')`,
      [userId, taskId],
    );
    const schedule = await pool.query(
      `select kind, start_at = end_at as is_point, timezone
       from task_schedules where user_id = $1 and task_id = $2`,
      [userId, taskId],
    );
    expect(schedule.rows).toEqual([{ kind: "timed", is_point: true, timezone: "UTC" }]);
  });

  it("installs only the canonical columns, ownership constraints, and bounded-range indexes", async () => {
    const columns = await pool.query<{ column_name: string }>(
      `select column_name
         from information_schema.columns
        where table_schema = current_schema() and table_name = 'task_schedules'
        order by ordinal_position`,
    );
    expect(columns.rows.map(({ column_name }) => column_name)).toEqual([
      "user_id",
      "task_id",
      "kind",
      "start_date",
      "end_date",
      "start_at",
      "end_at",
      "timezone",
      "created_at",
      "updated_at",
    ]);

    const constraints = await pool.query<{ conname: string }>(
      `select conname
         from pg_constraint
        where conrelid = 'task_schedules'::regclass
        order by conname`,
    );
    expect(constraints.rows.map(({ conname }) => conname)).toEqual([
      "task_schedules_bounds_check",
      "task_schedules_kind_check",
      "task_schedules_pkey",
      "task_schedules_shape_check",
      "task_schedules_task_owner_fk",
      "task_schedules_timezone_check",
    ]);

    const indexes = await pool.query<{ indexname: string }>(
      `select indexname
         from pg_indexes
        where schemaname = current_schema() and tablename = 'task_schedules'
        order by indexname`,
    );
    expect(indexes.rows.map(({ indexname }) => indexname)).toEqual([
      "task_schedules_pkey",
      "task_schedules_user_end_at_idx",
      "task_schedules_user_end_date_idx",
      "task_schedules_user_start_at_idx",
      "task_schedules_user_start_date_idx",
    ]);
  });
});
