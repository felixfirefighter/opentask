import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createWp02SchemaFixture, expectPostgresError, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("p2_occurrence_append_only_trigger");
let pool: Pool;

describe("P2 occurrence append-only trigger", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
  }, 60_000);

  afterAll(async () => fixture.teardown());

  it("rejects direct event updates and deletes while the owning task exists", async () => {
    const graph = await insertRecurringTaskGraph("direct-mutation");

    await expectPostgresError(
      pool.query(
        `update task_occurrence_events
            set state = 'open'
          where user_id = $1 and id = $2`,
        [graph.userId, graph.eventId],
      ),
      "55000",
    );
    await expectPostgresError(
      pool.query(`delete from task_occurrence_events where user_id = $1 and id = $2`, [
        graph.userId,
        graph.eventId,
      ]),
      "55000",
    );

    await expect(readEventState(graph.userId, graph.eventId)).resolves.toBe("completed");
  });

  it("permits task and account cascades after the owning task row is removed", async () => {
    const taskCascade = await insertRecurringTaskGraph("task-cascade");
    await pool.query(`delete from tasks where user_id = $1 and id = $2`, [
      taskCascade.userId,
      taskCascade.taskId,
    ]);
    await expect(readEventCount(taskCascade.userId, taskCascade.eventId)).resolves.toBe(0);

    const accountCascade = await insertRecurringTaskGraph("account-cascade");
    await pool.query(`delete from "user" where id = $1`, [accountCascade.userId]);
    await expect(readEventCount(accountCascade.userId, accountCascade.eventId)).resolves.toBe(0);
  });

  it("rejects an unrelated nested trigger that tries to delete event history", async () => {
    const graph = await insertRecurringTaskGraph("nested-trigger");
    await pool.query(`
      create table occurrence_delete_probe (
        id uuid primary key,
        user_id uuid not null,
        event_id uuid not null
      );

      create function delete_occurrence_from_unrelated_trigger() returns trigger
      language plpgsql
      as $$
      begin
        delete from task_occurrence_events
         where user_id = OLD.user_id and id = OLD.event_id;
        return OLD;
      end;
      $$;

      create trigger occurrence_delete_probe_nested_delete
      before delete on occurrence_delete_probe
      for each row execute function delete_occurrence_from_unrelated_trigger();
    `);
    const probeId = randomUUID();
    await pool.query(`insert into occurrence_delete_probe (id, user_id, event_id) values ($1, $2, $3)`, [
      probeId,
      graph.userId,
      graph.eventId,
    ]);

    await expectPostgresError(
      pool.query(`delete from occurrence_delete_probe where id = $1`, [probeId]),
      "55000",
    );

    await expect(readEventState(graph.userId, graph.eventId)).resolves.toBe("completed");
    const probe = await pool.query(`select id from occurrence_delete_probe where id = $1`, [probeId]);
    expect(probe.rowCount).toBe(1);
  });
});

async function insertRecurringTaskGraph(label: string) {
  const userId = await insertUser(pool, `p2-occurrence-trigger-${label}`);
  const listId = randomUUID();
  const taskId = randomUUID();
  const eventId = randomUUID();
  await pool.query(
    `insert into task_lists (id, user_id, name, color_token, rank, kind)
     values ($1, $2, $3, 'slate', $4, 'regular')`,
    [listId, userId, `List ${label}`, `a-${label}`],
  );
  await pool.query(
    `insert into tasks (id, user_id, list_id, title, description_md, rank, version)
     values ($1, $2, $3, $4, '', 'a0', 2)`,
    [taskId, userId, listId, `Task ${label}`],
  );
  await pool.query(
    `insert into task_schedules (user_id, task_id, kind, start_date, end_date)
     values ($1, $2, 'all_day', '2026-07-20', '2026-07-21')`,
    [userId, taskId],
  );
  await pool.query(
    `insert into task_recurrences
       (user_id, task_id, rrule, timezone, projection_start_date)
     values ($1, $2, 'FREQ=DAILY;INTERVAL=1', 'Asia/Singapore', '2026-07-20')`,
    [userId, taskId],
  );
  await pool.query(
    `insert into task_occurrence_events
       (id, user_id, task_id, occurrence_key, state, task_version)
     values ($1, $2, $3, 'o1.MjAyNi0wNy0yMA', 'completed', 2)`,
    [eventId, userId, taskId],
  );
  return { eventId, taskId, userId };
}

async function readEventState(userId: string, eventId: string) {
  const result = await pool.query<{ state: string }>(
    `select state from task_occurrence_events where user_id = $1 and id = $2`,
    [userId, eventId],
  );
  return result.rows[0]?.state;
}

async function readEventCount(userId: string, eventId: string) {
  const result = await pool.query<{ count: number }>(
    `select count(*)::int as count from task_occurrence_events where user_id = $1 and id = $2`,
    [userId, eventId],
  );
  return result.rows[0]?.count ?? 0;
}
