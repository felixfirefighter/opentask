import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateRanksBetween } from "../../modules/tasks/application/ranking.ts";

import { createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("subtask-rank-index");
let pool: Pool;
let userId: string;
let listId: string;
let targetParentId: string;

describe("WP02 subtask rank index", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    userId = await insertUser(pool, "subtask-rank-index");
    listId = randomUUID();
    await pool.query(
      `insert into task_lists (id, user_id, name, color_token, rank, kind)
       values ($1, $2, 'Rank plan list', 'slate', 'a0', 'regular')`,
      [listId, userId],
    );

    const client = await pool.connect();
    const subtaskRanks = generateRanksBetween(null, null, 150);
    try {
      await client.query("begin");
      for (let parentNumber = 1; parentNumber <= 40; parentNumber += 1) {
        const parentId = randomUUID();
        if (parentNumber === 1) targetParentId = parentId;
        await client.query(
          `insert into tasks (id, user_id, list_id, title, description_md, rank)
           values ($1, $2, $3, $4, '', 'a0')`,
          [parentId, userId, listId, `Parent ${parentNumber}`],
        );
        await client.query(
          `insert into tasks (id, user_id, list_id, parent_task_id, title, description_md, rank)
           select gen_random_uuid(), $1, $2, $3, 'Subtask ' || ranked.position, '', ranked.rank
             from unnest($4::text[]) with ordinality as ranked(rank, position)`,
          [userId, listId, parentId, subtaskRanks],
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    await pool.query("analyze tasks");
  });

  afterAll(async () => fixture.teardown());

  it("serves the active subtask rank-scope query in rank/id order without a sort", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local enable_seqscan = off");
      await client.query("set local enable_bitmapscan = off");
      await client.query("set local enable_sort = off");
      const result = await client.query<{ "QUERY PLAN": string }>(
        `explain (analyze, buffers, format text)
         select id, rank, version
           from tasks
          where user_id = $1
            and list_id = $2
            and parent_task_id = $3
            and deleted_at is null
          order by rank, id`,
        [userId, listId, targetParentId],
      );
      const plan = result.rows.map((row) => row["QUERY PLAN"]).join("\n");
      expect(plan).toContain("tasks_user_list_parent_active_rank_idx");
      expect(plan).not.toMatch(/\bSort\b/);
      expect(plan).toMatch(/actual time=.* rows=150 loops=1/);
      await client.query("rollback");
    } finally {
      client.release();
    }
  });
});
