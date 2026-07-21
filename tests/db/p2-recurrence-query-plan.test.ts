import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTaskOccurrenceEventRepository } from "../../modules/tasks/infrastructure/task-occurrence-event-repository.ts";
import { createTaskRecurrenceRepository } from "../../modules/tasks/infrastructure/task-recurrence-repository.ts";
import { schema } from "../../shared/db/schema.ts";

import { createWp02SchemaFixture } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("p2_recurrence_query_plan");
const owner = "11111111-1111-4111-8111-111111111111";
const listId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const datePrefix = "10000000";
const instantPrefix = "20000000";
const range = {
  rangeStartDate: "2026-07-18",
  rangeEndDate: "2026-07-21",
  rangeStartAt: new Date("2026-07-18T00:00:00.000Z"),
  rangeEndAt: new Date("2026-07-21T00:00:00.000Z"),
  limit: 100,
} as const;

type CapturedQuery = Readonly<{ sql: string; params: readonly unknown[] }>;
type ExplainNode = Readonly<{
  "Node Type": string;
  "Index Name"?: string;
  "Index Cond"?: string;
  Plans?: readonly ExplainNode[];
}>;
type ExplainDocument = Readonly<{ Plan: ExplainNode }>;

let pool: Pool;

describe("P2 recurrence query plans", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    await seedRecurrences(pool);
    await pool.query("analyze tasks");
    await pool.query("analyze task_schedules");
    await pool.query("analyze task_recurrences");
    await pool.query("analyze task_occurrence_events");
  });

  afterAll(async () => fixture.teardown());

  it("uses tenant-leading date and instant cutover indexes for bounded source reads", async () => {
    const capture = createQueryCapture(pool);
    const page = await createTaskRecurrenceRepository(capture.database).listActiveOpenSourcesInRange(
      owner,
      range,
    );

    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every(({ task }) => task.userId === owner)).toBe(true);
    expect(page.truncated).toBe(false);
    const queries = capture.allQueries();
    expect(queries).toHaveLength(2);
    const dateQuery = queryContaining(queries, '"task_recurrences"."projection_start_date" <');
    const instantQuery = queryContaining(queries, '"task_recurrences"."projection_start_at" <');
    expect(dateQuery.sql).toContain('"task_recurrences"."user_id" =');
    expect(instantQuery.sql).toContain('"task_recurrences"."user_id" =');
    expect(dateQuery.params).toContain("2026-06-17");
    expect(instantQuery.params).toContain("2026-06-17T00:00:00.000Z");

    const dateIndexes = indexNames(await explain(pool, dateQuery));
    const instantIndexes = indexNames(await explain(pool, instantQuery));
    expect(dateIndexes).toContain("task_recurrences_date_cutover_idx");
    expect(instantIndexes).toContain("task_recurrences_instant_cutover_idx");
  });

  it("uses the tenant/task/key/version index for bounded tenant latest-event reads", async () => {
    const capture = createQueryCapture(pool);
    const page = await createTaskOccurrenceEventRepository(capture.database).listLatestForUser(owner, 50_000);

    expect(page.items).toHaveLength(100);
    expect(page.items.every(({ userId, taskVersion }) => userId === owner && taskVersion === 3)).toBe(true);
    expect(page.truncated).toBe(false);
    const query = capture.lastQuery();
    expect(query.sql).toContain('"task_occurrence_events"."user_id" =');

    const eventPlan = await explain(pool, query, { disableBitmapScan: true });
    const indexNames = new Set(flattenPlan(eventPlan).map((node) => node["Index Name"]));
    expect(indexNames).toContain("task_occurrence_events_latest_state_idx");
  });

  it("uses tenant-leading keys for cutover-independent historical source hydration", async () => {
    const selectedTaskId = taskId(datePrefix, 0);
    const capture = createQueryCapture(pool);
    const page = await createTaskRecurrenceRepository(capture.database).listActiveOpenSourcesForTaskIds(
      owner,
      [selectedTaskId],
      100,
    );

    expect(page).toMatchObject({ truncated: false });
    expect(page.items.map(({ task }) => task.id)).toEqual([selectedTaskId]);
    expect(page.items.every(({ task }) => task.userId === owner)).toBe(true);
    const query = capture.lastQuery();
    expect(query.sql).toContain('"task_recurrences"."user_id" =');
    expect(query.sql).toContain('"task_recurrences"."task_id" in');

    const indexes = indexNames(await explain(pool, query));
    expect(indexes).toContain("task_recurrences_pkey");
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
    allQueries() {
      return [...queries];
    },
    lastQuery() {
      const query = queries.at(-1);
      if (!query) throw new Error("Expected the repository to execute a query.");
      return query;
    },
  };
}

async function explain(
  databasePool: Pool,
  query: CapturedQuery,
  options: Readonly<{ disableBitmapScan?: boolean }> = {},
): Promise<ExplainNode> {
  const client = await databasePool.connect();
  try {
    await client.query("begin");
    await client.query("set local enable_seqscan = off");
    if (options.disableBitmapScan) await client.query("set local enable_bitmapscan = off");
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

function indexNames(plan: ExplainNode): Set<string | undefined> {
  return new Set(flattenPlan(plan).map((node) => node["Index Name"]));
}

function queryContaining(queries: readonly CapturedQuery[], fragment: string): CapturedQuery {
  const query = queries.find(({ sql }) => sql.includes(fragment));
  if (!query) throw new Error(`Expected a captured query containing ${fragment}.`);
  return query;
}

async function seedRecurrences(databasePool: Pool) {
  await databasePool.query(
    `insert into "user" (id, name, email, email_verified)
     values ($1, 'Recurrence plan owner', 'recurrence-plan@example.test', false)`,
    [owner],
  );
  await databasePool.query(
    `insert into task_lists (id, user_id, name, color_token, rank, kind)
     values ($1, $2, 'Recurrence plans', 'slate', 'a0', 'regular')`,
    [listId, owner],
  );
  await seedRecurrenceKind(databasePool, datePrefix, "all_day");
  await seedRecurrenceKind(databasePool, instantPrefix, "timed");
  await databasePool.query(
    `insert into task_occurrence_events
       (id, user_id, task_id, occurrence_key, state, task_version, effective_at, created_at)
     select (lpad((sequence * 2 + event_offset + 1)::text, 8, '0') || '-0000-4000-8000-' ||
             lpad((sequence * 2 + event_offset + 1)::text, 12, '0'))::uuid,
            $1,
            ($2 || '-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
            'o1.plan' || lpad(sequence::text, 4, '0'),
            case when event_offset = 0 then 'completed' else 'open' end,
            2 + event_offset,
            timestamptz '2026-07-20 00:00:00+00' + event_offset * interval '1 minute',
            timestamptz '2026-07-20 00:00:00+00' + event_offset * interval '1 minute'
       from generate_series(0, 99) as sequence
       cross join generate_series(0, 1) as event_offset`,
    [owner, datePrefix],
  );
}

async function seedRecurrenceKind(databasePool: Pool, prefix: string, kind: "all_day" | "timed") {
  await databasePool.query(
    `insert into tasks (id, user_id, list_id, title, description_md, rank, version)
     select ($1 || '-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
            $2, $3, $4 || ' ' || sequence, '', $5 || lpad(sequence::text, 4, '0'), 3
       from generate_series(0, 511) as sequence`,
    [prefix, owner, listId, kind === "all_day" ? "All-day series" : "Timed series", kind.slice(0, 1)],
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
    [prefix, owner],
  );
  await databasePool.query(
    kind === "all_day"
      ? `insert into task_recurrences
           (user_id, task_id, rrule, timezone, projection_start_date, projection_end_date)
         select $2, ($1 || '-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
                'FREQ=DAILY;INTERVAL=1', 'UTC', date '2026-01-01' + sequence,
                date '2026-01-08' + sequence
           from generate_series(0, 511) as sequence`
      : `insert into task_recurrences
           (user_id, task_id, rrule, timezone, projection_start_at, projection_end_at)
         select $2, ($1 || '-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
                'FREQ=DAILY;INTERVAL=1', 'UTC',
                timestamptz '2026-01-01 09:00:00+00' + sequence * interval '1 day',
                timestamptz '2026-01-08 09:00:00+00' + sequence * interval '1 day'
           from generate_series(0, 511) as sequence`,
    [prefix, owner],
  );
}

function taskId(prefix: string, sequence: number): string {
  return `${prefix}-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}
