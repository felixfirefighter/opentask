import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

const timestampColumn = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export function createAssistantSchema(authUserId: () => AnyPgColumn) {
  const plannerProposals = pgTable(
    "planner_proposals",
    {
      id: uuid("id").notNull(),
      userId: uuid("user_id").notNull().references(authUserId, { onDelete: "cascade" }),
      planningDate: date("planning_date", { mode: "string" }).notNull(),
      schemaVersion: integer("schema_version").notNull(),
      proposal: jsonb("proposal").notNull(),
      contextVersions: jsonb("context_versions").notNull(),
      status: text("status").notNull(),
      model: text("model").notNull(),
      promptVersion: text("prompt_version").notNull(),
      idempotencyKey: uuid("idempotency_key").notNull(),
      createdAt: timestampColumn("created_at").defaultNow().notNull(),
      expiresAt: timestampColumn("expires_at").notNull(),
      appliedAt: timestampColumn("applied_at"),
    },
    (table) => [
      primaryKey({ name: "planner_proposals_pkey", columns: [table.userId, table.id] }),
      check("planner_proposals_schema_version_check", sql`${table.schemaVersion} > 0`),
      check(
        "planner_proposals_status_check",
        sql`${table.status} in ('pending', 'applied', 'expired', 'rejected')`,
      ),
      check("planner_proposals_model_check", sql`char_length(${table.model}) between 1 and 100`),
      check(
        "planner_proposals_prompt_version_check",
        sql`char_length(${table.promptVersion}) between 1 and 100`,
      ),
      check("planner_proposals_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
      check(
        "planner_proposals_applied_at_check",
        sql`(${table.status} = 'applied') = (${table.appliedAt} is not null)`,
      ),
      uniqueIndex("planner_proposals_user_idempotency_key_idx").on(table.userId, table.idempotencyKey),
      index("planner_proposals_user_status_expiry_idx").on(table.userId, table.status, table.expiresAt),
    ],
  );

  return { plannerProposals };
}
