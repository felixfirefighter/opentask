import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readCommittedMigrationRevisions } from "../../shared/db/migration-files.ts";

import { applyMigrationSlice, createWp02SchemaFixture, insertUser } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("planner_proposal_upgrade");
let pool: Pool;
let userId: string;

describe("planner proposal migration", () => {
  beforeAll(async () => {
    const revisions = readCommittedMigrationRevisions();
    const proposalRevision = revisions.findIndex((revision) =>
      revision.sql.some((statement) => statement.includes('CREATE TABLE "planner_proposals"')),
    );
    expect(proposalRevision).toBeGreaterThan(0);
    pool = await fixture.setup({ migrateLatest: false });
    await applyMigrationSlice(pool, 0, proposalRevision);
    userId = await insertUser(pool, "planner-upgrade-owner");
    await applyMigrationSlice(pool, proposalRevision, proposalRevision + 1);
  });

  afterAll(async () => fixture.teardown());

  it("preserves existing accounts and installs the approved proposal table only", async () => {
    await expect(pool.query(`select id from "user" where id = $1`, [userId])).resolves.toMatchObject({
      rows: [{ id: userId }],
    });

    const columns = await pool.query<{ column_name: string }>(
      `select column_name
         from information_schema.columns
        where table_schema = current_schema() and table_name = 'planner_proposals'
        order by ordinal_position`,
    );
    expect(columns.rows.map(({ column_name }) => column_name)).toEqual([
      "id",
      "user_id",
      "planning_date",
      "schema_version",
      "proposal",
      "context_versions",
      "status",
      "model",
      "prompt_version",
      "idempotency_key",
      "created_at",
      "expires_at",
      "applied_at",
    ]);

    const constraints = await pool.query<{ conname: string }>(
      `select conname
         from pg_constraint
        where conrelid = 'planner_proposals'::regclass
        order by conname`,
    );
    expect(constraints.rows.map(({ conname }) => conname)).toEqual([
      "planner_proposals_applied_at_check",
      "planner_proposals_expiry_check",
      "planner_proposals_model_check",
      "planner_proposals_pkey",
      "planner_proposals_prompt_version_check",
      "planner_proposals_schema_version_check",
      "planner_proposals_status_check",
      "planner_proposals_user_id_user_id_fk",
    ]);

    const indexes = await pool.query<{ indexname: string }>(
      `select indexname
         from pg_indexes
        where schemaname = current_schema() and tablename = 'planner_proposals'
        order by indexname`,
    );
    expect(indexes.rows.map(({ indexname }) => indexname)).toEqual([
      "planner_proposals_pkey",
      "planner_proposals_user_idempotency_key_idx",
      "planner_proposals_user_status_expiry_idx",
    ]);
  });

  it("keeps the ownership foreign key inside the migrated schema", async () => {
    const target = await pool.query<{ schema_name: string }>(
      `select target_namespace.nspname as schema_name
         from pg_constraint constraint_record
         join pg_class target_table on target_table.oid = constraint_record.confrelid
         join pg_namespace target_namespace on target_namespace.oid = target_table.relnamespace
        where constraint_record.conrelid = 'planner_proposals'::regclass
          and constraint_record.conname = 'planner_proposals_user_id_user_id_fk'`,
    );
    expect(target.rows).toEqual([{ schema_name: fixture.schemaName }]);
  });
});
