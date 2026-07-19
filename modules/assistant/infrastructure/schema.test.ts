import { getTableConfig, pgTable, uuid } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { createAssistantSchema } from "./schema";

describe("assistant schema contract", () => {
  it("owns the approved versioned proposal document with tenant-leading identity", () => {
    const authUser = pgTable("user", { id: uuid("id").primaryKey() });
    const table = createAssistantSchema(() => authUser.id).plannerProposals;
    const config = getTableConfig(table);

    expect(config.name).toBe("planner_proposals");
    expect(config.columns.map(({ name, notNull }) => [name, notNull])).toEqual([
      ["id", true],
      ["user_id", true],
      ["planning_date", true],
      ["schema_version", true],
      ["proposal", true],
      ["context_versions", true],
      ["status", true],
      ["model", true],
      ["prompt_version", true],
      ["idempotency_key", true],
      ["created_at", true],
      ["expires_at", true],
      ["applied_at", false],
    ]);
    expect(config.columns.find(({ name }) => name === "proposal")?.getSQLType()).toBe("jsonb");
    expect(config.columns.find(({ name }) => name === "context_versions")?.getSQLType()).toBe("jsonb");
    expect(config.primaryKeys).toHaveLength(1);
    expect(config.primaryKeys[0]?.columns.map(({ name }) => name)).toEqual(["user_id", "id"]);
    expect(config.checks.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "planner_proposals_schema_version_check",
        "planner_proposals_status_check",
        "planner_proposals_expiry_check",
        "planner_proposals_applied_at_check",
      ]),
    );
    expect(config.indexes.map(({ config: index }) => [index.name, index.unique])).toEqual(
      expect.arrayContaining([
        ["planner_proposals_user_idempotency_key_idx", true],
        ["planner_proposals_user_status_expiry_idx", false],
      ]),
    );
  });
});
