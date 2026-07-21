import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

const timestampColumn = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export function createPromptsSchema(authUserId: () => AnyPgColumn) {
  const savedPrompts = pgTable(
    "saved_prompts",
    {
      id: uuid("id").notNull(),
      userId: uuid("user_id").notNull().references(authUserId, { onDelete: "cascade" }),
      title: text("title").notNull(),
      description: text("description").notNull(),
      content: text("content").notNull(),
      version: integer("version").default(1).notNull(),
      createdAt: timestampColumn("created_at").defaultNow().notNull(),
      updatedAt: timestampColumn("updated_at").defaultNow().notNull(),
      archivedAt: timestampColumn("archived_at"),
    },
    (table) => [
      primaryKey({ name: "saved_prompts_pkey", columns: [table.userId, table.id] }),
      check("saved_prompts_title_check", sql`char_length(${table.title}) between 1 and 120`),
      check("saved_prompts_description_check", sql`char_length(${table.description}) between 1 and 280`),
      check("saved_prompts_content_check", sql`char_length(${table.content}) between 1 and 20000`),
      check("saved_prompts_version_check", sql`${table.version} > 0`),
      index("saved_prompts_user_active_updated_idx").on(table.userId, table.archivedAt, table.updatedAt),
    ],
  );

  const savedPromptTags = pgTable(
    "saved_prompt_tags",
    {
      userId: uuid("user_id").notNull().references(authUserId, { onDelete: "cascade" }),
      promptId: uuid("prompt_id").notNull(),
      normalizedName: text("normalized_name").notNull(),
      name: text("name").notNull(),
    },
    (table) => [
      primaryKey({
        name: "saved_prompt_tags_pkey",
        columns: [table.userId, table.promptId, table.normalizedName],
      }),
      check("saved_prompt_tags_name_check", sql`char_length(${table.name}) between 1 and 32`),
      foreignKey({
        name: "saved_prompt_tags_prompt_owner_fk",
        columns: [table.userId, table.promptId],
        foreignColumns: [savedPrompts.userId, savedPrompts.id],
      }).onDelete("cascade"),
      index("saved_prompt_tags_user_name_idx").on(table.userId, table.normalizedName),
      uniqueIndex("saved_prompt_tags_display_idx").on(table.userId, table.promptId, table.name),
    ],
  );

  return { savedPrompts, savedPromptTags };
}
