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

export function createCompanionSchema(authUserId: () => AnyPgColumn) {
  const companionProfiles = pgTable(
    "companion_profiles",
    {
      userId: uuid("user_id").primaryKey().references(authUserId, { onDelete: "cascade" }),
      totalXp: integer("total_xp").default(0).notNull(),
      level: integer("level").default(1).notNull(),
      proactiveMessages: text("proactive_messages").default("enabled").notNull(),
      communicationStyle: text("communication_style").default("warm").notNull(),
      dailyMode: text("daily_mode"),
      dailyModeDate: date("daily_mode_date", { mode: "string" }),
      lastDailyPromptDate: date("last_daily_prompt_date", { mode: "string" }),
      schemaVersion: integer("schema_version").default(1).notNull(),
      version: integer("version").default(1).notNull(),
      createdAt: timestampColumn("created_at").defaultNow().notNull(),
      updatedAt: timestampColumn("updated_at").defaultNow().notNull(),
    },
    (table) => [
      check("companion_profiles_total_xp_check", sql`${table.totalXp} >= 0`),
      check("companion_profiles_level_check", sql`${table.level} between 1 and 3`),
      check(
        "companion_profiles_proactive_messages_check",
        sql`${table.proactiveMessages} in ('enabled', 'muted')`,
      ),
      check(
        "companion_profiles_communication_style_check",
        sql`${table.communicationStyle} in ('warm', 'focused', 'direct')`,
      ),
      check("companion_profiles_schema_version_check", sql`${table.schemaVersion} = 1`),
      check("companion_profiles_version_check", sql`${table.version} > 0`),
    ],
  );

  const companionXpEvents = pgTable(
    "companion_xp_events",
    {
      id: uuid("id").defaultRandom().notNull(),
      userId: uuid("user_id").notNull().references(authUserId, { onDelete: "cascade" }),
      actionType: text("action_type").notNull(),
      sourceKey: text("source_key").notNull(),
      xp: integer("xp").notNull(),
      localDate: date("local_date", { mode: "string" }).notNull(),
      createdAt: timestampColumn("created_at").defaultNow().notNull(),
    },
    (table) => [
      primaryKey({ name: "companion_xp_events_pkey", columns: [table.userId, table.id] }),
      check("companion_xp_events_xp_check", sql`${table.xp} > 0 and ${table.xp} <= 25`),
      check(
        "companion_xp_events_action_type_check",
        sql`${table.actionType} in ('task_completed', 'planner_applied', 'daily_checkin', 'focus_completed')`,
      ),
      check("companion_xp_events_source_key_check", sql`char_length(${table.sourceKey}) between 1 and 180`),
      uniqueIndex("companion_xp_events_source_idx").on(table.userId, table.actionType, table.sourceKey),
      uniqueIndex("companion_xp_events_planner_daily_idx")
        .on(table.userId, table.localDate)
        .where(sql`${table.actionType} = 'planner_applied'`),
      index("companion_xp_events_user_date_idx").on(table.userId, table.localDate),
    ],
  );

  const companionBehaviorSummaries = pgTable(
    "companion_behavior_summaries",
    {
      userId: uuid("user_id").primaryKey().references(authUserId, { onDelete: "cascade" }),
      schemaVersion: integer("schema_version").notNull(),
      summary: jsonb("summary").notNull(),
      windowStartedOn: date("window_started_on", { mode: "string" }).notNull(),
      windowEndedOn: date("window_ended_on", { mode: "string" }).notNull(),
      generatedAt: timestampColumn("generated_at").defaultNow().notNull(),
    },
    (table) => [
      check("companion_behavior_summaries_schema_version_check", sql`${table.schemaVersion} = 1`),
      check("companion_behavior_summaries_document_check", sql`jsonb_typeof(${table.summary}) = 'object'`),
      check(
        "companion_behavior_summaries_window_check",
        sql`${table.windowEndedOn} >= ${table.windowStartedOn}`,
      ),
    ],
  );

  const companionMemories = pgTable(
    "companion_memories",
    {
      id: uuid("id").defaultRandom().notNull(),
      userId: uuid("user_id").notNull().references(authUserId, { onDelete: "cascade" }),
      text: text("text").notNull(),
      createdAt: timestampColumn("created_at").defaultNow().notNull(),
    },
    (table) => [
      primaryKey({ name: "companion_memories_pkey", columns: [table.userId, table.id] }),
      check("companion_memories_text_check", sql`char_length(${table.text}) between 1 and 500`),
      index("companion_memories_user_created_idx").on(table.userId, table.createdAt),
    ],
  );

  return { companionProfiles, companionXpEvents, companionBehaviorSummaries, companionMemories };
}
