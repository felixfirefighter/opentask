import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export function createTaskSchema(authUserId: () => AnyPgColumn) {
  const taskLists = pgTable(
    "task_lists",
    {
      id: uuid("id").primaryKey(),
      userId: uuid("user_id").notNull().references(authUserId, { onDelete: "cascade" }),
      name: text("name").notNull(),
      colorToken: text("color_token").notNull(),
      rank: text("rank").notNull(),
      kind: text("kind").notNull(),
      version: integer("version").default(1).notNull(),
      createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
      updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
      deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
    },
    (table) => [
      check("task_lists_kind_check", sql`${table.kind} in ('inbox', 'regular')`),
      check("task_lists_version_check", sql`${table.version} > 0`),
      check("task_lists_name_check", sql`length(btrim(${table.name})) > 0`),
      index("task_lists_user_active_rank_idx")
        .on(table.userId, table.rank)
        .where(sql`${table.deletedAt} is null`),
      uniqueIndex("task_lists_one_active_inbox_per_user_idx")
        .on(table.userId)
        .where(sql`${table.kind} = 'inbox' and ${table.deletedAt} is null`),
    ],
  );

  return { taskLists };
}
