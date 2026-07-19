import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTaskPlanningSourceRepository } from "../../modules/tasks/infrastructure/task-planning-source-repository.ts";
import { createTaskScheduleRepository } from "../../modules/tasks/infrastructure/task-schedule-repository.ts";
import { schema } from "../../shared/db/schema.ts";

import { createWp02SchemaFixture } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("planning_query_plan");
const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const range = {
  rangeStartDate: "2026-07-18",
  rangeEndDate: "2026-07-21",
  rangeStartAt: new Date("2026-07-18T00:00:00.000Z"),
  rangeEndAt: new Date("2026-07-21T00:00:00.000Z"),
  limit: 100,
} as const;

const scheduleRangeIndexes = new Set([
  "task_schedules_user_start_date_idx",
  "task_schedules_user_end_date_idx",
  "task_schedules_user_start_at_idx",
  "task_schedules_user_end_at_idx",
]);

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

describe("planning range query plans", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    await seedSchedules(pool, ownerA, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "10000000", "20000000");
    await seedSchedules(pool, ownerB, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "30000000", "40000000");
    await pool.query("analyze tasks");
    await pool.query("analyze task_schedules");
  });

  afterAll(async () => fixture.teardown());

  it("keeps schedule and planning range reads tenant-leading and index-eligible", async () => {
    const scheduleCapture = createQueryCapture(pool);
    const schedulePage = await createTaskScheduleRepository(
      schema.taskSchedules,
      scheduleCapture.database,
    ).listActiveOpenInRange(ownerA, range);

    expect(schedulePage.items.length).toBeGreaterThan(0);
    expect(new Set(schedulePage.items.map(({ schedule }) => schedule.kind))).toEqual(
      new Set(["all_day", "timed"]),
    );
    expect(schedulePage.items.every(({ task }) => task.userId === ownerA)).toBe(true);
    expect(schedulePage.truncated).toBe(false);
    await expectRangePlan(pool, scheduleCapture.lastQuery());

    const planningCapture = createQueryCapture(pool);
    const planningPage = await createTaskPlanningSourceRepository(
      schema.taskSchedules,
      planningCapture.database,
    ).listScheduledRange(ownerA, range);

    expect(planningPage.items.length).toBeGreaterThan(0);
    expect(new Set(planningPage.items.map(({ schedule }) => schedule?.kind))).toEqual(
      new Set(["all_day", "timed"]),
    );
    expect(planningPage.items.every(({ task }) => task.userId === ownerA)).toBe(true);
    expect(planningPage.truncated).toBe(false);
    await expectRangePlan(pool, planningCapture.lastQuery());
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
      if (!query) throw new Error("Expected the repository to execute a query.");
      return query;
    },
  };
}

async function expectRangePlan(databasePool: Pool, query: CapturedQuery) {
  expect(query.sql).toContain('"task_schedules"."user_id" =');
  expect(query.sql).toContain('"tasks"."user_id" =');
  expect(query.sql).toContain('"task_schedules"."start_date" <');
  expect(query.sql).toContain('"task_schedules"."end_date" >');
  expect(query.sql).toContain('"task_schedules"."start_at" <');
  expect(query.sql).toContain('"task_schedules"."end_at" >');
  expect(query.params).toEqual(
    expect.arrayContaining([
      ownerA,
      range.rangeStartDate,
      range.rangeEndDate,
      range.rangeStartAt.toISOString(),
      range.rangeEndAt.toISOString(),
    ]),
  );

  const plan = await explain(databasePool, query);
  const indexNodes = flattenPlan(plan).filter(
    (node) => node["Index Name"] && scheduleRangeIndexes.has(node["Index Name"]),
  );
  expect(indexNodes.some((node) => node["Index Name"]?.includes("_date_"))).toBe(true);
  expect(indexNodes.some((node) => node["Index Name"]?.includes("_at_"))).toBe(true);
  expect(
    indexNodes.every((node) => {
      const condition = node["Index Cond"] ?? "";
      return condition.includes("user_id") && /(start_date|end_date|start_at|end_at)/u.test(condition);
    }),
  ).toBe(true);
}

async function explain(databasePool: Pool, query: CapturedQuery): Promise<ExplainNode> {
  const client = await databasePool.connect();
  try {
    await client.query("begin");
    // This probes index eligibility independent of whether a tiny fixture makes a sequential scan cheaper.
    await client.query("set local enable_seqscan = off");
    const result = await client.query<{ "QUERY PLAN": readonly ExplainDocument[] }>(
      `explain (analyze, buffers, costs off, timing off, summary off, format json) ${query.sql}`,
      [...query.params],
    );
    const plan = result.rows[0]?.["QUERY PLAN"]?.[0]?.Plan;
    if (!plan) throw new Error("PostgreSQL did not return an EXPLAIN plan.");
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

async function seedSchedules(
  databasePool: Pool,
  userId: string,
  listId: string,
  allDayPrefix: string,
  timedPrefix: string,
) {
  await databasePool.query(
    `insert into "user" (id, name, email, email_verified)
     values ($1, $2, $3, false)`,
    [userId, `Plan owner ${userId.slice(0, 4)}`, `${userId}@example.test`],
  );
  await databasePool.query(
    `insert into task_lists (id, user_id, name, color_token, rank, kind)
     values ($1, $2, 'Planning fixtures', 'slate', 'a0', 'regular')`,
    [listId, userId],
  );
  await seedScheduleKind(databasePool, userId, listId, allDayPrefix, "all_day");
  await seedScheduleKind(databasePool, userId, listId, timedPrefix, "timed");
}

async function seedScheduleKind(
  databasePool: Pool,
  userId: string,
  listId: string,
  taskPrefix: string,
  kind: "all_day" | "timed",
) {
  await databasePool.query(
    `insert into tasks (id, user_id, list_id, title, description_md, rank)
     select ($1 || '-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
            $2, $3, $4 || ' ' || sequence, '', $5 || lpad(sequence::text, 4, '0')
       from generate_series(0, 511) as sequence`,
    [taskPrefix, userId, listId, kind === "all_day" ? "All-day" : "Timed", kind.slice(0, 1)],
  );

  await databasePool.query(
    kind === "all_day"
      ? `insert into task_schedules (user_id, task_id, kind, start_date, end_date)
         select $2, ($1 || '-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
                'all_day', date '2026-01-01' + sequence, date '2026-01-02' + sequence
           from generate_series(0, 511) as sequence`
      : `insert into task_schedules (user_id, task_id, kind, start_at, end_at, timezone)
         select $2, ($1 || '-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
                'timed', timestamptz '2026-01-01 09:00:00+00' + sequence * interval '1 day',
                timestamptz '2026-01-01 10:00:00+00' + sequence * interval '1 day', 'UTC'
           from generate_series(0, 511) as sequence`,
    [taskPrefix, userId],
  );
}
