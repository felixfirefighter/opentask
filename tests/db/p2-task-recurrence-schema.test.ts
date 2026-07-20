import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createWp02SchemaFixture, expectPostgresError, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("p2_recurrence_schema");
let pool: Pool;
let ownerA: string;
let ownerB: string;
let taskA: string;
let taskB: string;

describe("P2 task recurrence PostgreSQL invariants", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    ownerA = await insertUser(pool, "p2-recurrence-owner-a");
    ownerB = await insertUser(pool, "p2-recurrence-owner-b");
    taskA = await insertTaskGraph(pool, ownerA, "a");
    taskB = await insertTaskGraph(pool, ownerB, "b");
  });

  afterAll(async () => fixture.teardown());

  it("enforces tenant ownership and checked date/instant cutover representations", async () => {
    await insertDateRecurrence(pool, ownerA, taskA);

    await expectPostgresError(insertDateRecurrence(pool, ownerB, taskA, { start: "2026-07-21" }), "23503");
    await expectPostgresError(
      pool.query(
        `insert into task_recurrences
           (user_id, task_id, rrule, timezone, projection_start_date, projection_start_at)
         values ($1, $2, 'FREQ=DAILY;INTERVAL=1', 'UTC', '2026-07-21', '2026-07-21T00:00:00Z')`,
        [ownerB, taskB],
      ),
      "23514",
    );

    await pool.query(
      `insert into task_recurrences
         (user_id, task_id, rrule, timezone, projection_start_at, projection_end_at)
       values ($1, $2, 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO', 'UTC',
               '2026-07-20T09:00:00Z', '2026-07-20T09:00:00Z')`,
      [ownerB, taskB],
    );
    const emptyEnded = await pool.query(
      `select projection_start_at = projection_end_at as empty_interval
         from task_recurrences where user_id = $1 and task_id = $2`,
      [ownerB, taskB],
    );
    expect(emptyEnded.rows).toEqual([{ empty_interval: true }]);
  });

  it("rejects malformed stored rules, invalid generation modes, and reversed cutovers", async () => {
    const malformedTasks = await Promise.all([
      insertTaskGraph(pool, ownerA, "lowercase"),
      insertTaskGraph(pool, ownerA, "dtstart"),
      insertTaskGraph(pool, ownerA, "mode"),
      insertTaskGraph(pool, ownerA, "reverse"),
    ]);

    await expectPostgresError(
      insertDateRecurrence(pool, ownerA, malformedTasks[0]!, { rrule: "FREQ=daily" }),
      "23514",
    );
    await expectPostgresError(
      insertDateRecurrence(pool, ownerA, malformedTasks[1]!, {
        rrule: "DTSTART=20260721;FREQ=DAILY",
      }),
      "23514",
    );
    await expectPostgresError(
      pool.query(
        `insert into task_recurrences
           (user_id, task_id, rrule, timezone, generation_mode, projection_start_date)
         values ($1, $2, 'FREQ=DAILY', 'UTC', 'completion', '2026-07-21')`,
        [ownerA, malformedTasks[2]],
      ),
      "23514",
    );
    await expectPostgresError(
      insertDateRecurrence(pool, ownerA, malformedTasks[3]!, {
        start: "2026-07-21",
        end: "2026-07-20",
      }),
      "23514",
    );
  });

  it("keeps occurrence events tenant-bound, versioned, constrained, and append-only", async () => {
    const eventId = randomUUID();
    await pool.query(
      `insert into task_occurrence_events
         (id, user_id, task_id, occurrence_key, state, task_version)
       values ($1, $2, $3, 'o1.dGVzdA', 'completed', 2)`,
      [eventId, ownerA, taskA],
    );

    await expectPostgresError(
      pool.query(
        `insert into task_occurrence_events
           (id, user_id, task_id, occurrence_key, state, task_version)
         values ($1, $2, $3, 'o1.Zm9yZWlnbg', 'completed', 2)`,
        [randomUUID(), ownerB, taskA],
      ),
      "23503",
    );
    await expectPostgresError(
      pool.query(
        `insert into task_occurrence_events
           (id, user_id, task_id, occurrence_key, state, task_version)
         values ($1, $2, $3, 'o1.c2FtZS12ZXJzaW9u', 'skipped', 2)`,
        [randomUUID(), ownerA, taskA],
      ),
      "23505",
    );
    await expectPostgresError(
      pool.query(
        `insert into task_occurrence_events
           (id, user_id, task_id, occurrence_key, state, task_version)
         values ($1, $2, $3, 'o1.aW52YWxpZA', 'dismissed', 3)`,
        [randomUUID(), ownerA, taskA],
      ),
      "23514",
    );

    await expectPostgresError(
      pool.query(`update task_occurrence_events set state = 'open' where user_id = $1 and id = $2`, [
        ownerA,
        eventId,
      ]),
      "55000",
    );
    await expectPostgresError(
      pool.query(`delete from task_occurrence_events where user_id = $1 and id = $2`, [ownerA, eventId]),
      "55000",
    );
  });

  it("permits only referential task/account cascades to remove append-only events", async () => {
    const taskCascadeOwner = await insertUser(pool, "p2-task-cascade-owner");
    const taskCascade = await insertTaskGraph(pool, taskCascadeOwner, "task-cascade");
    await insertOccurrenceEvent(pool, taskCascadeOwner, taskCascade, 2);
    await pool.query(`delete from tasks where user_id = $1 and id = $2`, [taskCascadeOwner, taskCascade]);
    await expect(eventCount(pool, taskCascadeOwner, taskCascade)).resolves.toBe(0);

    const accountCascadeOwner = await insertUser(pool, "p2-account-cascade-owner");
    const accountCascade = await insertTaskGraph(pool, accountCascadeOwner, "account-cascade");
    await insertOccurrenceEvent(pool, accountCascadeOwner, accountCascade, 2);
    await pool.query(`delete from "user" where id = $1`, [accountCascadeOwner]);
    await expect(eventCount(pool, accountCascadeOwner, accountCascade)).resolves.toBe(0);
  });
});

async function insertTaskGraph(targetPool: Pool, userId: string, label: string) {
  const listId = randomUUID();
  const taskId = randomUUID();
  await targetPool.query(
    `insert into task_lists (id, user_id, name, color_token, rank, kind)
     values ($1, $2, $3, 'slate', $4, 'regular')`,
    [listId, userId, `List ${label}`, `a-${label}`],
  );
  await targetPool.query(
    `insert into tasks (id, user_id, list_id, title, description_md, rank)
     values ($1, $2, $3, $4, '', 'a0')`,
    [taskId, userId, listId, `Task ${label}`],
  );
  await targetPool.query(
    `insert into task_schedules (user_id, task_id, kind, start_date, end_date)
     values ($1, $2, 'all_day', '2026-07-21', '2026-07-22')`,
    [userId, taskId],
  );
  return taskId;
}

function insertDateRecurrence(
  targetPool: Pool,
  userId: string,
  taskId: string,
  overrides: Readonly<{ rrule?: string; start?: string; end?: string | null }> = {},
) {
  return targetPool.query(
    `insert into task_recurrences
       (user_id, task_id, rrule, timezone, projection_start_date, projection_end_date)
     values ($1, $2, $3, 'Asia/Singapore', $4, $5)`,
    [
      userId,
      taskId,
      overrides.rrule ?? "FREQ=DAILY;INTERVAL=1",
      overrides.start ?? "2026-07-21",
      overrides.end ?? null,
    ],
  );
}

function insertOccurrenceEvent(targetPool: Pool, userId: string, taskId: string, taskVersion: number) {
  return targetPool.query(
    `insert into task_occurrence_events
       (id, user_id, task_id, occurrence_key, state, task_version)
     values ($1, $2, $3, 'o1.Y2FzY2FkZQ', 'completed', $4)`,
    [randomUUID(), userId, taskId, taskVersion],
  );
}

async function eventCount(targetPool: Pool, userId: string, taskId: string) {
  const result = await targetPool.query<{ count: string }>(
    `select count(*)::text as count
       from task_occurrence_events where user_id = $1 and task_id = $2`,
    [userId, taskId],
  );
  return Number(result.rows[0]?.count ?? "0");
}
