import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPlannerProposalRepository } from "../../modules/assistant/infrastructure/planner-proposal-repository.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";

import { createWp02SchemaFixture, expectPostgresError, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("planner_proposal");
const now = new Date("2026-07-20T00:00:00.000Z");
let pool: Pool;
let database: Database;
let ownerA: string;
let ownerB: string;
let repository: ReturnType<typeof createPlannerProposalRepository>;

describe("planner proposal PostgreSQL integration", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema });
    ownerA = await insertUser(pool, "planner-owner-a");
    ownerB = await insertUser(pool, "planner-owner-b");
    repository = createPlannerProposalRepository(schema.plannerProposals, database);
  });

  afterAll(async () => fixture.teardown());

  it("scopes proposal reads and transitions by both owner and proposal ID", async () => {
    const proposalId = randomUUID();
    await repository.insert(proposalRecord(ownerA, proposalId, randomUUID()));

    await expect(repository.findOwned(ownerB, proposalId)).resolves.toBeNull();
    await expect(
      repository.transitionOwned(ownerB, proposalId, "pending", "rejected", null),
    ).resolves.toBeNull();
    await expect(repository.findOwned(ownerA, proposalId)).resolves.toMatchObject({
      userId: ownerA,
      id: proposalId,
      status: "pending",
    });
    await expect(
      repository.transitionOwned(ownerA, proposalId, "pending", "rejected", null),
    ).resolves.toMatchObject({ status: "rejected" });
  });

  it("keeps idempotency actor-scoped and rejects a duplicate key for one actor", async () => {
    const sharedProposalId = randomUUID();
    const sharedApplyToken = randomUUID();
    await repository.insert(proposalRecord(ownerA, sharedProposalId, sharedApplyToken));
    await expect(
      repository.insert(proposalRecord(ownerB, sharedProposalId, sharedApplyToken)),
    ).resolves.toMatchObject({ userId: ownerB, id: sharedProposalId });
    await expectPostgresError(
      pool.query(
        `insert into planner_proposals
          (id, user_id, planning_date, schema_version, proposal, context_versions, status,
           model, prompt_version, idempotency_key, created_at, expires_at)
         values ($1, $2, '2026-07-20', 1, '{}', '{}', 'pending',
                 'gpt-5.6', 'planner-v1', $3, $4, $4::timestamptz + interval '30 minutes')`,
        [randomUUID(), ownerA, sharedApplyToken, now],
      ),
      "23505",
    );
  });

  it("expires only the requesting actor's pending due proposals", async () => {
    const dueA = randomUUID();
    const futureA = randomUUID();
    const dueB = randomUUID();
    await repository.insert(proposalRecord(ownerA, dueA, randomUUID(), new Date("2026-07-19T23:59:00Z")));
    await repository.insert(proposalRecord(ownerA, futureA, randomUUID(), new Date("2026-07-20T01:00:00Z")));
    await repository.insert(proposalRecord(ownerB, dueB, randomUUID(), new Date("2026-07-19T23:59:00Z")));

    await expect(repository.expireOwned(ownerA, now)).resolves.toBe(1);
    await expect(repository.findOwned(ownerA, dueA)).resolves.toMatchObject({ status: "expired" });
    await expect(repository.findOwned(ownerA, futureA)).resolves.toMatchObject({ status: "pending" });
    await expect(repository.findOwned(ownerB, dueB)).resolves.toMatchObject({ status: "pending" });
  });

  it("enforces expiry, status/applied-at, and tenant foreign-key constraints", async () => {
    const base = [randomUUID(), ownerA, randomUUID(), now];
    await expectPostgresError(
      pool.query(
        `insert into planner_proposals
          (id, user_id, planning_date, schema_version, proposal, context_versions, status,
           model, prompt_version, idempotency_key, created_at, expires_at)
         values ($1, $2, '2026-07-20', 1, '{}', '{}', 'pending',
                 'gpt-5.6', 'planner-v1', $3, $4, $4)`,
        base,
      ),
      "23514",
    );
    await expectPostgresError(
      pool.query(
        `insert into planner_proposals
          (id, user_id, planning_date, schema_version, proposal, context_versions, status,
           model, prompt_version, idempotency_key, created_at, expires_at, applied_at)
         values ($1, $2, '2026-07-20', 1, '{}', '{}', 'pending',
                 'gpt-5.6', 'planner-v1', $3, $4, $4::timestamptz + interval '30 minutes', $4)`,
        [randomUUID(), ownerA, randomUUID(), now],
      ),
      "23514",
    );
    await expectPostgresError(
      pool.query(
        `insert into planner_proposals
          (id, user_id, planning_date, schema_version, proposal, context_versions, status,
           model, prompt_version, idempotency_key, created_at, expires_at)
         values ($1, $2, '2026-07-20', 1, '{}', '{}', 'pending',
                 'gpt-5.6', 'planner-v1', $3, $4, $4::timestamptz + interval '30 minutes')`,
        [randomUUID(), randomUUID(), randomUUID(), now],
      ),
      "23503",
    );
  });
});

function proposalRecord(
  userId: string,
  id: string,
  idempotencyKey: string,
  expiresAt = new Date("2026-07-20T00:30:00Z"),
) {
  return {
    id,
    userId,
    planningDate: "2026-07-20",
    schemaVersion: 1,
    proposal: { schemaVersion: 1, summary: "Review", actions: [] },
    contextVersions: {},
    status: "pending" as const,
    model: "gpt-5.6",
    promptVersion: "planner-extraction-v1",
    idempotencyKey,
    createdAt: new Date("2026-07-19T23:30:00Z"),
    expiresAt,
    appliedAt: null,
  };
}
