import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createWp02SchemaFixture, expectPostgresError, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("p4_focus_constraints");
let pool: Pool;

describe("P4 Focus PostgreSQL invariants", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
  }, 60_000);

  afterAll(async () => fixture.teardown());

  it("accepts only the canonical timer, link, and timestamp shapes", async () => {
    const owner = await createOwnerGraph("shape-owner");
    await insertSession(owner.userId, {
      taskId: owner.taskId,
      kind: "focus",
      mode: "pomodoro",
      state: "active",
      plannedSeconds: 1_500,
    });
    await pool.query(`delete from focus_sessions where user_id = $1`, [owner.userId]);
    await insertSession(owner.userId, {
      habitId: owner.habitId,
      kind: "focus",
      mode: "stopwatch",
      state: "paused",
      plannedSeconds: null,
      pausedAt: "2026-07-21T10:05:00.000Z",
      accumulatedActiveSeconds: 300,
    });
    await pool.query(`delete from focus_sessions where user_id = $1`, [owner.userId]);
    await insertSession(owner.userId, {
      kind: "break",
      mode: "pomodoro",
      state: "completed",
      plannedSeconds: 300,
      endedAt: "2026-07-21T10:05:00.000Z",
      accumulatedActiveSeconds: 300,
    });

    for (const invalid of [
      { taskId: owner.taskId, habitId: owner.habitId },
      { kind: "break", mode: "stopwatch", plannedSeconds: null },
      { kind: "break", taskId: owner.taskId, plannedSeconds: 300 },
      { kind: "break", plannedSeconds: 3_660 },
      { kind: "focus", mode: "pomodoro", plannedSeconds: 61 },
      { kind: "focus", mode: "pomodoro", plannedSeconds: 14_460 },
      { kind: "focus", mode: "stopwatch", plannedSeconds: 60 },
      { accumulatedActiveSeconds: -1 },
      { state: "active", pausedAt: "2026-07-21T10:05:00.000Z" },
      { state: "paused", pausedAt: null },
      { state: "completed", endedAt: null },
      { state: "completed", endedAt: "2026-07-21T09:59:59.000Z" },
    ] as const) {
      await expectInvalidSession(owner.userId, invalid);
    }
  });

  it("permits only one unfinished focus-or-break row during a concurrent start race", async () => {
    const { userId } = await createOwnerGraph("race-owner");
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await first.query("begin");
      await second.query("begin");
      await insertSession(userId, {}, first);
      const competing = insertSession(userId, { kind: "break", plannedSeconds: 300 }, second);
      await first.query("commit");
      await expectPostgresError(competing, "23505");
      await second.query("rollback");
    } finally {
      first.release();
      second.release();
    }
    await expect(
      pool.query<{ count: number }>(
        `select count(*)::int as count from focus_sessions where user_id = $1 and state in ('active','paused')`,
        [userId],
      ),
    ).resolves.toMatchObject({ rows: [{ count: 1 }] });
  });

  it("rejects cross-user task and habit links while preserving owned history", async () => {
    const owner = await createOwnerGraph("link-owner");
    const stranger = await createOwnerGraph("link-stranger");
    await expectPostgresError(insertSession(owner.userId, { taskId: stranger.taskId }), "23503");
    await expectPostgresError(insertSession(owner.userId, { habitId: stranger.habitId }), "23503");

    await insertSession(owner.userId, {
      taskId: owner.taskId,
      state: "completed",
      endedAt: "2026-07-21T10:25:00.000Z",
      accumulatedActiveSeconds: 1_500,
    });
    await pool.query(`update tasks set deleted_at = now() where user_id = $1 and id = $2`, [
      owner.userId,
      owner.taskId,
    ]);
    await expect(
      pool.query<{ task_id: string }>(`select task_id from focus_sessions where user_id = $1`, [
        owner.userId,
      ]),
    ).resolves.toMatchObject({ rows: [{ task_id: owner.taskId }] });
  });
});

type SessionOverrides = Readonly<{
  taskId?: string | null;
  habitId?: string | null;
  kind?: "focus" | "break";
  mode?: "pomodoro" | "stopwatch";
  state?: "active" | "paused" | "completed";
  pausedAt?: string | null;
  accumulatedActiveSeconds?: number;
  plannedSeconds?: number | null;
  endedAt?: string | null;
}>;

async function insertSession(
  userId: string,
  overrides: SessionOverrides = {},
  executor: Pool | PoolClient = pool,
) {
  const row = {
    id: randomUUID(),
    taskId: null,
    habitId: null,
    kind: "focus",
    mode: "pomodoro",
    state: "active",
    startedAt: "2026-07-21T10:00:00.000Z",
    pausedAt: null,
    accumulatedActiveSeconds: 0,
    plannedSeconds: 1_500,
    endedAt: null,
    ...overrides,
  };
  return executor.query(
    `insert into focus_sessions
       (id,user_id,task_id,habit_id,kind,mode,state,started_at,paused_at,
        accumulated_active_seconds,planned_seconds,ended_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      row.id,
      userId,
      row.taskId,
      row.habitId,
      row.kind,
      row.mode,
      row.state,
      row.startedAt,
      row.pausedAt,
      row.accumulatedActiveSeconds,
      row.plannedSeconds,
      row.endedAt,
    ],
  );
}

async function expectInvalidSession(userId: string, overrides: SessionOverrides) {
  await pool.query(`delete from focus_sessions where user_id = $1`, [userId]);
  await expectPostgresError(insertSession(userId, overrides), "23514");
}

async function createOwnerGraph(marker: string) {
  const userId = await insertUser(pool, marker);
  const listId = randomUUID();
  const taskId = randomUUID();
  const habitId = randomUUID();
  await pool.query(
    `insert into task_lists (id,user_id,name,color_token,rank,kind)
     values ($1,$2,'Focus list','slate','a0','regular')`,
    [listId, userId],
  );
  await pool.query(
    `insert into tasks (id,user_id,list_id,title,description_md,rank)
     values ($1,$2,$3,'Focus task','','a0')`,
    [taskId, userId, listId],
  );
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into habits (id,user_id,title,icon,color_token,goal_kind)
       values ($1,$2,'Focus habit','F','mint','boolean')`,
      [habitId, userId],
    );
    await client.query(
      `insert into habit_schedules (user_id,habit_id,kind,timezone,start_date)
       values ($1,$2,'daily','UTC','2026-07-01')`,
      [userId, habitId],
    );
    await client.query("commit");
  } finally {
    client.release();
  }
  return { userId, taskId, habitId } as const;
}
