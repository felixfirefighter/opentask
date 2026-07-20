import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSearchApplication } from "../../modules/tasks/application/search-application.ts";
import type { AuthenticatedActor } from "../../shared/auth/actor.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";

import { createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const testInstant = new Date("2026-07-20T02:00:00.000Z");
const fixture = createWp02SchemaFixture("p2_search_recurrence_metadata");

let pool: Pool;
let database: Database;
let ownerA: AuthenticatedActor;
let ownerB: AuthenticatedActor;

describe("P2 search recurrence metadata integration", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema });
    ownerA = { userId: await insertUser(pool, "p2-search-recurrence-owner-a") };
    ownerB = { userId: await insertUser(pool, "p2-search-recurrence-owner-b") };
  });

  afterAll(async () => fixture.teardown());

  it("returns only the actor's recurrence lifecycle for a tenant-shared task UUID", async () => {
    const sharedTaskId = randomUUID();
    const signal = `Recurring search ${randomUUID().slice(0, 8)}`;
    const [listAId, listBId] = await Promise.all([
      insertList(ownerA, "Owner A recurring search"),
      insertList(ownerB, "Owner B recurring search"),
    ]);

    await Promise.all([
      insertTask(ownerA, listAId, sharedTaskId, signal),
      insertTask(ownerB, listBId, sharedTaskId, signal),
    ]);
    await database.insert(schema.taskRecurrences).values([
      {
        userId: ownerA.userId,
        taskId: sharedTaskId,
        rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE",
        timezone: "Asia/Singapore",
        generationMode: "schedule",
        projectionStartDate: "2026-07-20",
        createdAt: testInstant,
        updatedAt: testInstant,
      },
      {
        userId: ownerB.userId,
        taskId: sharedTaskId,
        rrule: "FREQ=DAILY;INTERVAL=3;COUNT=9",
        timezone: "America/New_York",
        generationMode: "schedule",
        projectionStartDate: "2026-07-01",
        projectionEndDate: "2026-07-19",
        createdAt: testInstant,
        updatedAt: testInstant,
      },
    ]);

    const search = createSearchApplication({ database });
    const [resultA, resultB] = await Promise.all([
      search.searchTasks(ownerA, { q: signal, limit: 20 }),
      search.searchTasks(ownerB, { q: signal, limit: 20 }),
    ]);

    expect(resultA).toMatchObject({
      items: [
        {
          task: { id: sharedTaskId, title: signal },
          recurrence: { status: "active" },
          matchedFields: ["title"],
          matchingTags: [],
        },
      ],
      nextCursor: null,
    });
    expect(resultB).toMatchObject({
      items: [
        {
          task: { id: sharedTaskId, title: signal },
          recurrence: { status: "ended" },
          matchedFields: ["title"],
          matchingTags: [],
        },
      ],
      nextCursor: null,
    });
    expect(resultA.items).toHaveLength(1);
    expect(resultB.items).toHaveLength(1);
    expect(resultA.items[0]?.recurrence).toStrictEqual({ status: "active" });
    expect(resultB.items[0]?.recurrence).toStrictEqual({ status: "ended" });

    const serialized = JSON.stringify([resultA, resultB]);
    for (const privateValue of [
      ownerA.userId,
      ownerB.userId,
      "rrule",
      "timezone",
      "generationMode",
      "projectionStartDate",
      "projectionEndDate",
      "FREQ=WEEKLY",
      "FREQ=DAILY",
      "Asia/Singapore",
      "America/New_York",
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });
});

async function insertList(actor: AuthenticatedActor, name: string): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into task_lists (id, user_id, name, color_token, rank, kind)
     values ($1, $2, $3, 'slate', 'a0', 'regular')`,
    [id, actor.userId, name],
  );
  return id;
}

async function insertTask(
  actor: AuthenticatedActor,
  listId: string,
  id: string,
  title: string,
): Promise<void> {
  await pool.query(
    `insert into tasks
       (id, user_id, list_id, title, description_md, status, priority, rank,
        status_changed_at, version, created_at, updated_at)
     values ($1, $2, $3, $4, '', 'open', 'none', 'a0', $5, 1, $5, $5)`,
    [id, actor.userId, listId, title, testInstant],
  );
}
