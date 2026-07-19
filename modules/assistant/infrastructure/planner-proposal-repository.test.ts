import { drizzle as createProxyDatabase, type RemoteCallback } from "drizzle-orm/pg-proxy";
import { pgTable, uuid } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import type { DatabaseExecutor } from "@/shared/db/client";

import { createPlannerProposalRepository } from "./planner-proposal-repository";
import { createAssistantSchema } from "./schema";

const userId = "11111111-1111-4111-8111-111111111111";
const proposalId = "22222222-2222-4222-8222-222222222222";
const applyToken = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-07-20T00:00:00.000Z");

type CapturedQuery = { sql: string; params: unknown[]; method: string };

function createRecorder() {
  const authUser = pgTable("user", { id: uuid("id").primaryKey() });
  const table = createAssistantSchema(() => authUser.id).plannerProposals;
  const queries: CapturedQuery[] = [];
  const callback: RemoteCallback = async (sql, params, method) => {
    queries.push({ sql, params, method });
    return { rows: [] };
  };
  const database = createProxyDatabase(callback, { schema: { plannerProposals: table } });
  return {
    table,
    queries,
    repository: createPlannerProposalRepository(table, database as unknown as DatabaseExecutor),
  };
}

describe("planner proposal repository SQL scoping", () => {
  it("constrains reads and status transitions by both actor and proposal identity", async () => {
    const fixture = createRecorder();
    await fixture.repository.findOwned(userId, proposalId);
    await fixture.repository.transitionOwned(userId, proposalId, "pending", "rejected", null);

    expect(fixture.queries).toHaveLength(2);
    for (const query of fixture.queries) {
      expect(query.sql).toContain('"planner_proposals"."user_id" =');
      expect(query.sql).toContain('"planner_proposals"."id" =');
      expect(query.params).toEqual(expect.arrayContaining([userId, proposalId]));
    }
    expect(fixture.queries[1]?.sql).toContain('"planner_proposals"."status" =');
    expect(fixture.queries[1]?.params).toContain("pending");
  });

  it("expires only one actor's pending due proposals", async () => {
    const fixture = createRecorder();
    await expect(fixture.repository.expireOwned(userId, now)).resolves.toBe(0);

    const query = fixture.queries[0];
    expect(query?.sql).toContain('update "planner_proposals"');
    expect(query?.sql).toContain('"planner_proposals"."user_id" =');
    expect(query?.sql).toContain('"planner_proposals"."status" =');
    expect(query?.sql).toContain('"planner_proposals"."expires_at" <=');
    expect(query?.params).toEqual(expect.arrayContaining([userId, "pending", now.toISOString()]));
  });

  it("deletes reset data only for the selected actor", async () => {
    const fixture = createRecorder();
    await expect(fixture.repository.deleteOwned(userId)).resolves.toBe(0);

    const query = fixture.queries[0];
    expect(query?.sql).toContain('delete from "planner_proposals"');
    expect(query?.sql).toContain('"planner_proposals"."user_id" =');
    expect(query?.params).toContain(userId);
  });

  it("rejects an applied status without its matching application timestamp", async () => {
    const fixture = createRecorder();
    await expect(
      fixture.repository.transitionOwned(userId, proposalId, "pending", "applied", null),
    ).rejects.toThrow(RangeError);
    expect(fixture.queries).toHaveLength(0);
  });

  it("writes only the structured proposal row and fails closed when insert returns no row", async () => {
    const fixture = createRecorder();
    await expect(
      fixture.repository.insert({
        id: proposalId,
        userId,
        planningDate: "2026-07-20",
        schemaVersion: 1,
        proposal: { schemaVersion: 1, actions: [] },
        contextVersions: {},
        status: "pending",
        model: "gpt-5.6",
        promptVersion: "planner-extraction-v1",
        idempotencyKey: applyToken,
        createdAt: now,
        expiresAt: new Date("2026-07-20T00:30:00.000Z"),
        appliedAt: null,
      }),
    ).rejects.toThrow("Planner proposal insert returned no row.");

    expect(fixture.queries[0]?.sql).toContain('insert into "planner_proposals"');
    expect(fixture.queries[0]?.params).toEqual(
      expect.arrayContaining([proposalId, userId, applyToken, "gpt-5.6"]),
    );
    expect(JSON.stringify(fixture.queries[0])).not.toContain("brainDump");
  });
});
