import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("search");
let pool: Pool;
let userId: string;

describe("WP02 search index plans", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    for (let ownerIndex = 0; ownerIndex < 10; ownerIndex += 1) {
      const ownerId = await insertUser(pool, `search-owner-${ownerIndex}`);
      if (ownerIndex === 0) userId = ownerId;
      const listId = randomUUID();
      await pool.query(
        `insert into task_lists (id, user_id, name, color_token, rank, kind)
         values ($1, $2, 'Search list', 'slate', 'a0', 'regular')`,
        [listId, ownerId],
      );
      await pool.query(
        `insert into tasks (id, user_id, list_id, title, description_md, rank)
         select gen_random_uuid(), $1, $2,
                case when $3::boolean and number = 777
                     then 'Violet nebula signal' else 'Ordinary task ' || number end,
                case when $3::boolean and number = 888
                     then 'Copper orbit signal' else 'Routine description ' || number end,
                'a' || lpad(number::text, 5, '0')
           from generate_series(1, 4000) number`,
        [ownerId, listId, ownerIndex === 0],
      );
      await pool.query(
        `insert into tags (id, user_id, name, color_token)
         select gen_random_uuid(), $1,
                case when $2::boolean and number = 555
                     then 'Cerulean focus signal' else 'Search tag ' || number end,
                'slate'
           from generate_series(1, 10000) number`,
        [ownerId, ownerIndex === 0],
      );
    }
    await pool.query("analyze tasks");
    await pool.query("analyze tags");
  });

  afterAll(async () => fixture.teardown());

  it("uses the partial trigram indexes for scoped title, description, and tag predicates", async () => {
    const client = await pool.connect();
    try {
      await client.query("set enable_seqscan = off");
      await client.query("set enable_indexscan = off");
      await expectIndex(client, "tasks_title_search_idx", {
        text: `select id from tasks
                where user_id::text = $1 and deleted_at is null
                  and lower(title) like '%violet nebula signal%'`,
        values: [userId],
      });
      await expectIndex(client, "tasks_description_search_idx", {
        text: `select id from tasks
                where user_id::text = $1 and deleted_at is null
                  and lower(description_md) like '%copper orbit signal%'`,
        values: [userId],
      });
      await expectIndex(client, "tags_name_search_idx", {
        text: `select id from tags
                where user_id::text = $1 and deleted_at is null
                  and lower(name) like '%cerulean%'`,
        values: [userId],
      });
    } finally {
      client.release();
    }
  });
});

async function expectIndex(client: PoolClient, indexName: string, query: { text: string; values: string[] }) {
  const result = await client.query<{ "QUERY PLAN": string }>(
    `explain (analyze, buffers, format text) ${query.text}`,
    query.values,
  );
  const plan = result.rows.map((row) => row["QUERY PLAN"]).join("\n");
  expect(plan).toContain(indexName);
}
