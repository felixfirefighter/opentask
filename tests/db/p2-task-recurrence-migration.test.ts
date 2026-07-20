import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readCommittedMigrationRevisions } from "../../shared/db/migration-files.ts";

import { applyMigrationSlice, createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("p2_recurrence_upgrade");
let pool: Pool;
let userId: string;
let taskId: string;

describe("P2 task recurrence migration", () => {
  beforeAll(async () => {
    const revisions = readCommittedMigrationRevisions();
    const recurrenceRevision = revisions.findIndex((revision) =>
      revision.sql.some((statement) => statement.includes('CREATE TABLE "task_recurrences"')),
    );
    expect(recurrenceRevision).toBeGreaterThan(0);

    pool = await fixture.setup({ migrateLatest: false });
    await applyMigrationSlice(pool, 0, recurrenceRevision);

    userId = await insertUser(pool, "p2-recurrence-upgrade-owner");
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
    await pool.query(
      `insert into task_schedules (user_id, task_id, kind, start_date, end_date)
       values ($1, $2, 'all_day', '2026-07-21', '2026-07-22')`,
      [userId, taskId],
    );

    const before = await pool.query(
      `select to_regclass('task_recurrences') as recurrences,
              to_regclass('task_occurrence_events') as events`,
    );
    expect(before.rows[0]).toEqual({ recurrences: null, events: null });

    await applyMigrationSlice(pool, recurrenceRevision, recurrenceRevision + 1);
  });

  afterAll(async () => fixture.teardown());

  it("upgrades populated task and schedule data without rewriting it", async () => {
    const task = await pool.query(
      `select t.title, t.version, s.kind, s.start_date::text, s.end_date::text
         from tasks t
         join task_schedules s on s.user_id = t.user_id and s.task_id = t.id
        where t.user_id = $1 and t.id = $2`,
      [userId, taskId],
    );
    expect(task.rows).toEqual([
      {
        title: "Existing task",
        version: 1,
        kind: "all_day",
        start_date: "2026-07-21",
        end_date: "2026-07-22",
      },
    ]);

    await pool.query(
      `insert into task_recurrences
         (user_id, task_id, rrule, timezone, projection_start_date)
       values ($1, $2, 'FREQ=DAILY;INTERVAL=1', 'Asia/Singapore', '2026-07-21')`,
      [userId, taskId],
    );
    await pool.query(
      `insert into task_occurrence_events
         (id, user_id, task_id, occurrence_key, state, task_version)
       values ($1, $2, $3, $4, 'completed', 2)`,
      [randomUUID(), userId, taskId, "o1.dGVzdA"],
    );
  });

  it("installs both canonical tables and the append-only trigger", async () => {
    const tables = await pool.query<{ table_name: string }>(
      `select table_name
         from information_schema.tables
        where table_schema = current_schema()
          and table_name in ('task_recurrences', 'task_occurrence_events')
        order by table_name`,
    );
    expect(tables.rows.map((row) => row.table_name)).toEqual(["task_occurrence_events", "task_recurrences"]);

    const trigger = await pool.query<{ trigger_name: string }>(
      `select distinct trigger_name
         from information_schema.triggers
        where event_object_schema = current_schema()
          and event_object_table = 'task_occurrence_events'
          and trigger_name = 'task_occurrence_events_immutable'`,
    );
    expect(trigger.rows).toEqual([{ trigger_name: "task_occurrence_events_immutable" }]);
  });
});
