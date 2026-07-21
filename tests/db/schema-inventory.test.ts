import { getTableName } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { schema } from "../../shared/db/schema.ts";

import { createWp02SchemaFixture } from "./wp02-schema-support.ts";

const approvedColumns = {
  account: [
    "id",
    "account_id",
    "provider_id",
    "user_id",
    "access_token",
    "refresh_token",
    "id_token",
    "access_token_expires_at",
    "refresh_token_expires_at",
    "scope",
    "password",
    "created_at",
    "updated_at",
  ],
  checklist_items: [
    "id",
    "user_id",
    "task_id",
    "title",
    "is_completed",
    "rank",
    "version",
    "created_at",
    "updated_at",
  ],
  focus_sessions: [
    "id",
    "user_id",
    "task_id",
    "habit_id",
    "kind",
    "mode",
    "state",
    "started_at",
    "paused_at",
    "accumulated_active_seconds",
    "planned_seconds",
    "ended_at",
    "version",
    "created_at",
    "updated_at",
  ],
  habit_logs: [
    "id",
    "user_id",
    "habit_id",
    "local_date",
    "state",
    "quantity",
    "note",
    "version",
    "created_at",
    "updated_at",
  ],
  habit_schedules: [
    "user_id",
    "habit_id",
    "kind",
    "weekdays",
    "target_per_week",
    "timezone",
    "start_date",
    "end_date",
    "created_at",
    "updated_at",
  ],
  habits: [
    "id",
    "user_id",
    "title",
    "icon",
    "color_token",
    "goal_kind",
    "target_value",
    "unit",
    "version",
    "created_at",
    "updated_at",
    "archived_at",
  ],
  list_folders: ["id", "user_id", "name", "rank", "version", "created_at", "updated_at", "deleted_at"],
  list_sections: ["id", "user_id", "list_id", "name", "rank", "version", "created_at", "updated_at"],
  planner_proposals: [
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
  ],
  rate_limit: ["id", "key", "count", "last_request"],
  session: ["id", "expires_at", "token", "created_at", "updated_at", "ip_address", "user_agent", "user_id"],
  tags: ["id", "user_id", "name", "color_token", "version", "created_at", "updated_at", "deleted_at"],
  task_lists: [
    "id",
    "user_id",
    "name",
    "color_token",
    "rank",
    "kind",
    "version",
    "created_at",
    "updated_at",
    "deleted_at",
    "folder_id",
  ],
  task_schedules: [
    "user_id",
    "task_id",
    "kind",
    "start_date",
    "end_date",
    "start_at",
    "end_at",
    "timezone",
    "created_at",
    "updated_at",
  ],
  task_occurrence_events: [
    "id",
    "user_id",
    "task_id",
    "occurrence_key",
    "state",
    "task_version",
    "effective_at",
    "created_at",
  ],
  task_recurrences: [
    "user_id",
    "task_id",
    "rrule",
    "timezone",
    "generation_mode",
    "projection_start_date",
    "projection_start_at",
    "projection_end_date",
    "projection_end_at",
    "created_at",
    "updated_at",
  ],
  task_tags: ["user_id", "task_id", "tag_id"],
  tasks: [
    "id",
    "user_id",
    "list_id",
    "section_id",
    "parent_task_id",
    "title",
    "description_md",
    "status",
    "priority",
    "rank",
    "status_changed_at",
    "version",
    "created_at",
    "updated_at",
    "deleted_at",
  ],
  user: ["id", "name", "email", "email_verified", "image", "created_at", "updated_at"],
  user_preferences: ["user_id", "schema_version", "preferences", "version", "created_at", "updated_at"],
  verification: ["id", "identifier", "value", "expires_at", "created_at", "updated_at"],
} as const;

describe("global application schema inventory", () => {
  const fixture = createWp02SchemaFixture("global_inventory");
  let pool: Pool;

  beforeAll(async () => {
    pool = await fixture.setup();
  });

  afterAll(async () => fixture.teardown());

  it("matches the complete application table and column allowlist", async () => {
    const result = await pool.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name
         from information_schema.columns
        where table_schema = current_schema()
          and table_name <> '__drizzle_migrations'
        order by table_name, ordinal_position`,
    );
    const tableNames = [...new Set(result.rows.map((row) => row.table_name))];
    const actualColumns = Object.fromEntries(
      tableNames.map((tableName) => [
        tableName,
        result.rows.filter((row) => row.table_name === tableName).map((row) => row.column_name),
      ]),
    );

    expect(actualColumns).toEqual(approvedColumns);
  });

  it("keeps the Drizzle composition root aligned with migrated application tables", async () => {
    const migrated = await pool.query<{ table_name: string }>(
      `select tablename as table_name
         from pg_tables
        where schemaname = current_schema()
          and tablename <> '__drizzle_migrations'
        order by tablename`,
    );
    const composed = Object.values(schema)
      .map((table) => getTableName(table))
      .sort();
    const approved = Object.keys(approvedColumns).sort();

    expect(migrated.rows.map((row) => row.table_name)).toEqual(approved);
    expect(composed).toEqual(approved);
  });
});
