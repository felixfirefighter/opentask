import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

type TaskOwnershipColumns = Readonly<{ userId: AnyPgColumn; id: AnyPgColumn }>;

const timestampColumn = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export function createTaskRecurrenceSchema(tasks: TaskOwnershipColumns) {
  const taskRecurrences = pgTable(
    "task_recurrences",
    {
      userId: uuid("user_id").notNull(),
      taskId: uuid("task_id").notNull(),
      rrule: text("rrule").notNull(),
      timezone: text("timezone").notNull(),
      generationMode: text("generation_mode").default("schedule").notNull(),
      projectionStartDate: date("projection_start_date", { mode: "string" }),
      projectionStartAt: timestampColumn("projection_start_at"),
      projectionEndDate: date("projection_end_date", { mode: "string" }),
      projectionEndAt: timestampColumn("projection_end_at"),
      createdAt: timestampColumn("created_at").defaultNow().notNull(),
      updatedAt: timestampColumn("updated_at").defaultNow().notNull(),
    },
    (table) => [
      primaryKey({ name: "task_recurrences_pkey", columns: [table.userId, table.taskId] }),
      foreignKey({
        name: "task_recurrences_task_owner_fk",
        columns: [table.userId, table.taskId],
        foreignColumns: [tasks.userId, tasks.id],
      }).onDelete("cascade"),
      check("task_recurrences_generation_mode_check", sql`${table.generationMode} = 'schedule'`),
      check(
        "task_recurrences_rrule_check",
        sql`char_length(${table.rrule}) between 1 and 512
          and ${table.rrule} ~ '^[A-Z0-9=;,]+$'
          and ${table.rrule} !~ '(^|;)(DTSTART|RDATE|EXDATE|EXRULE)='`,
      ),
      check("task_recurrences_timezone_check", sql`char_length(${table.timezone}) between 1 and 128`),
      check(
        "task_recurrences_cutover_shape_check",
        sql`(
          ${table.projectionStartDate} is not null
          and ${table.projectionStartAt} is null
          and ${table.projectionEndAt} is null
          and (
            ${table.projectionEndDate} is null
            or ${table.projectionEndDate} >= ${table.projectionStartDate}
          )
        ) or (
          ${table.projectionStartDate} is null
          and ${table.projectionStartAt} is not null
          and ${table.projectionEndDate} is null
          and (
            ${table.projectionEndAt} is null
            or ${table.projectionEndAt} >= ${table.projectionStartAt}
          )
        )`,
      ),
      index("task_recurrences_date_cutover_idx")
        .on(table.userId, table.projectionStartDate, table.projectionEndDate, table.taskId)
        .where(sql`${table.projectionStartDate} is not null`),
      index("task_recurrences_instant_cutover_idx")
        .on(table.userId, table.projectionStartAt, table.projectionEndAt, table.taskId)
        .where(sql`${table.projectionStartAt} is not null`),
    ],
  );

  const taskOccurrenceEvents = pgTable(
    "task_occurrence_events",
    {
      id: uuid("id").notNull(),
      userId: uuid("user_id").notNull(),
      taskId: uuid("task_id").notNull(),
      occurrenceKey: text("occurrence_key").notNull(),
      state: text("state").notNull(),
      taskVersion: integer("task_version").notNull(),
      effectiveAt: timestampColumn("effective_at").defaultNow().notNull(),
      createdAt: timestampColumn("created_at").defaultNow().notNull(),
    },
    (table) => [
      primaryKey({ name: "task_occurrence_events_pkey", columns: [table.userId, table.id] }),
      foreignKey({
        name: "task_occurrence_events_task_owner_fk",
        columns: [table.userId, table.taskId],
        foreignColumns: [tasks.userId, tasks.id],
      }).onDelete("cascade"),
      unique("task_occurrence_events_user_task_version_unique").on(
        table.userId,
        table.taskId,
        table.taskVersion,
      ),
      check("task_occurrence_events_key_check", sql`char_length(${table.occurrenceKey}) between 1 and 80`),
      check("task_occurrence_events_state_check", sql`${table.state} in ('completed', 'skipped', 'open')`),
      check("task_occurrence_events_version_check", sql`${table.taskVersion} > 0`),
      index("task_occurrence_events_latest_state_idx").on(
        table.userId,
        table.taskId,
        table.occurrenceKey,
        table.taskVersion.desc(),
      ),
    ],
  );

  return { taskRecurrences, taskOccurrenceEvents };
}
