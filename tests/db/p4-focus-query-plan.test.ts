import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createFocusSessionRepository } from "../../modules/focus/infrastructure/focus-session-repository.ts";
import { schema } from "../../shared/db/schema.ts";

import { createWp02SchemaFixture } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("p4_focus_query_plan");
const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const completedRange = {
  startAt: new Date("2026-01-01T00:00:00.000Z"),
  endAt: new Date("2026-01-03T00:00:00.000Z"),
} as const;

type CapturedQuery = Readonly<{ sql: string; params: readonly unknown[] }>;
type ExplainNode = Readonly<{
  "Node Type": string;
  "Index Name"?: string;
  "Index Cond"?: string;
  Filter?: string;
  Plans?: readonly ExplainNode[];
}>;
type ExplainDocument = Readonly<{ Plan: ExplainNode }>;

let pool: Pool;

describe("P4 Focus tenant-leading query plans", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    await seedFocusSessions(pool, ownerA, "10000000", 1);
    await seedFocusSessions(pool, ownerB, "20000000", 10);
    await pool.query("analyze focus_sessions");
  }, 60_000);

  afterAll(async () => fixture.teardown());

  it("uses the unfinished partial index for the actor-scoped active timer read", async () => {
    const capture = createQueryCapture(pool);
    const row = await createFocusSessionRepository(capture.database).findUnfinished(ownerA);

    expect(row).toMatchObject({ userId: ownerA, state: "active" });
    const query = capture.lastQuery();
    expect(query.sql).toContain('"focus_sessions"."user_id" =');
    expect(query.sql).toContain('"focus_sessions"."state" =');
    expect(query.params).toEqual(expect.arrayContaining([ownerA, "active", "paused"]));
    await expectIndexPlan(pool, query, "focus_sessions_one_unfinished_per_user_idx", ["user_id"]);
  });

  it("uses the completed-history partial index for bounded actor-scoped history", async () => {
    const capture = createQueryCapture(pool);
    const rows = await createFocusSessionRepository(capture.database).listCompletedFocus(ownerA, {
      limit: 20,
    });

    expect(rows).toHaveLength(20);
    expect(
      rows.every(({ userId, kind, state }) => userId === ownerA && kind === "focus" && state === "completed"),
    ).toBe(true);
    const query = capture.lastQuery();
    expect(query.sql).toContain('"focus_sessions"."user_id" =');
    expect(query.sql).toContain('"focus_sessions"."kind" =');
    expect(query.sql).toContain('"focus_sessions"."state" =');
    expect(query.sql).toContain('order by "focus_sessions"."ended_at" desc');
    expect(query.params).toEqual(expect.arrayContaining([ownerA, "focus", "completed", 20]));
    await expectIndexPlan(pool, query, "focus_sessions_completed_history_idx", ["user_id"]);
  });

  it("uses the completed-history partial index for actor-scoped summary windows", async () => {
    const capture = createQueryCapture(pool);
    const rows = await createFocusSessionRepository(capture.database).sumCompletedFocusByLocalDate(
      ownerA,
      "UTC",
      completedRange,
    );

    expect(rows.reduce((total, row) => total + row.totalSeconds, 0)).toBe(512);
    const query = capture.lastQuery();
    expect(query.sql).toContain('"focus_sessions"."user_id" =');
    expect(query.sql).toContain('"focus_sessions"."ended_at" >=');
    expect(query.sql).toContain('"focus_sessions"."ended_at" <');
    expect(query.params).toEqual(
      expect.arrayContaining([
        ownerA,
        "focus",
        "completed",
        completedRange.startAt.toISOString(),
        completedRange.endAt.toISOString(),
      ]),
    );
    await expectIndexPlan(pool, query, "focus_sessions_completed_history_idx", ["user_id", "ended_at"]);
  });
});

function createQueryCapture(databasePool: Pool) {
  const queries: CapturedQuery[] = [];
  const database = drizzle(databasePool, {
    schema,
    logger: {
      logQuery(sql, params) {
        queries.push({ sql, params: [...params] });
      },
    },
  });
  return {
    database,
    lastQuery() {
      const query = queries.at(-1);
      if (!query) throw new Error("Expected the Focus repository to execute a query.");
      return query;
    },
  };
}

async function expectIndexPlan(
  databasePool: Pool,
  query: CapturedQuery,
  expectedIndex: string,
  expectedConditions: readonly string[],
) {
  const plan = await explain(databasePool, query);
  const indexNode = flattenPlan(plan).find((node) => node["Index Name"] === expectedIndex);
  expect(indexNode).toBeDefined();
  const condition = indexNode?.["Index Cond"] ?? "";
  for (const expected of expectedConditions) expect(condition).toContain(expected);
}

async function explain(databasePool: Pool, query: CapturedQuery): Promise<ExplainNode> {
  const client = await databasePool.connect();
  try {
    await client.query("begin");
    await client.query("set local enable_seqscan = off");
    const result = await client.query<{ "QUERY PLAN": readonly ExplainDocument[] }>(
      `explain (analyze, buffers, costs off, timing off, summary off, format json) ${query.sql}`,
      [...query.params],
    );
    const plan = result.rows[0]?.["QUERY PLAN"]?.[0]?.Plan;
    if (!plan) throw new Error("PostgreSQL did not return a Focus EXPLAIN plan.");
    return plan;
  } finally {
    await rollback(client);
    client.release();
  }
}

async function rollback(client: PoolClient) {
  try {
    await client.query("rollback");
  } catch {
    // Preserve the original EXPLAIN failure; fixture teardown drops the isolated schema.
  }
}

function flattenPlan(node: ExplainNode): readonly ExplainNode[] {
  return [node, ...(node.Plans ?? []).flatMap(flattenPlan)];
}

async function seedFocusSessions(databasePool: Pool, userId: string, idPrefix: string, focusSeconds: number) {
  await databasePool.query(`insert into "user" (id,name,email,email_verified) values ($1,$2,$3,false)`, [
    userId,
    `Focus owner ${userId.slice(0, 4)}`,
    `${userId}@example.test`,
  ]);
  await databasePool.query(
    `insert into focus_sessions
       (id,user_id,kind,mode,state,started_at,accumulated_active_seconds,planned_seconds,ended_at)
     select ($1 || '-0000-4000-8000-' || lpad(sequence::text,12,'0'))::uuid,
            $2,'focus','stopwatch','completed',
            timestamptz '2026-01-01 00:00:00+00' + sequence * interval '1 minute',
            $3,null,
            timestamptz '2026-01-01 00:00:01+00' + sequence * interval '1 minute'
       from generate_series(0,511) as sequence`,
    [idPrefix, userId, focusSeconds],
  );
  await databasePool.query(
    `insert into focus_sessions
       (id,user_id,kind,mode,state,started_at,accumulated_active_seconds,planned_seconds,ended_at)
     select ($1 || '-0001-4000-8000-' || lpad(sequence::text,12,'0'))::uuid,
            $2,'break','pomodoro','completed',
            timestamptz '2026-01-01 00:00:00+00' + sequence * interval '1 minute',
            300,300,
            timestamptz '2026-01-01 00:05:00+00' + sequence * interval '1 minute'
       from generate_series(0,511) as sequence`,
    [idPrefix, userId],
  );
  await databasePool.query(
    `insert into focus_sessions
       (id,user_id,kind,mode,state,started_at,accumulated_active_seconds,planned_seconds)
     values (($1 || '-0002-4000-8000-000000000000')::uuid,$2,'focus','stopwatch','active',now(),0,null)`,
    [idPrefix, userId],
  );
}
