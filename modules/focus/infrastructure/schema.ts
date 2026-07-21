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

type ColumnReference = () => AnyPgColumn;

export type FocusSchemaReferences = Readonly<{
  authUserId: ColumnReference;
  taskUserId: ColumnReference;
  taskId: ColumnReference;
  habitUserId: ColumnReference;
  habitId: ColumnReference;
}>;

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export function createFocusSchema(references: FocusSchemaReferences) {
  const focusSessions = pgTable(
    "focus_sessions",
    {
      id: uuid("id").notNull(),
      userId: uuid("user_id").notNull().references(references.authUserId, { onDelete: "cascade" }),
      taskId: uuid("task_id"),
      habitId: uuid("habit_id"),
      kind: text("kind").notNull(),
      mode: text("mode").notNull(),
      state: text("state").notNull(),
      startedAt: instant("started_at").notNull(),
      pausedAt: instant("paused_at"),
      accumulatedActiveSeconds: integer("accumulated_active_seconds").default(0).notNull(),
      plannedSeconds: integer("planned_seconds"),
      endedAt: instant("ended_at"),
      version: integer("version").default(1).notNull(),
      createdAt: instant("created_at").defaultNow().notNull(),
      updatedAt: instant("updated_at").defaultNow().notNull(),
    },
    (table) => [
      primaryKey({ name: "focus_sessions_pkey", columns: [table.userId, table.id] }),
      foreignKey({
        name: "focus_sessions_task_owner_fk",
        columns: [table.userId, table.taskId],
        foreignColumns: [references.taskUserId(), references.taskId()],
      }).onDelete("no action"),
      foreignKey({
        name: "focus_sessions_habit_owner_fk",
        columns: [table.userId, table.habitId],
        foreignColumns: [references.habitUserId(), references.habitId()],
      }).onDelete("no action"),
      check("focus_sessions_kind_check", sql`${table.kind} in ('focus', 'break')`),
      check("focus_sessions_mode_check", sql`${table.mode} in ('pomodoro', 'stopwatch')`),
      check("focus_sessions_state_check", sql`${table.state} in ('active', 'paused', 'completed')`),
      check(
        "focus_sessions_link_shape_check",
        sql`not (${table.taskId} is not null and ${table.habitId} is not null)`,
      ),
      check(
        "focus_sessions_timer_shape_check",
        sql`(
          ${table.kind} = 'focus'
          and (
            (
              ${table.mode} = 'pomodoro'
              and ${table.plannedSeconds} between 60 and 14400
              and mod(${table.plannedSeconds}, 60) = 0
            )
            or (${table.mode} = 'stopwatch' and ${table.plannedSeconds} is null)
          )
        ) or (
          ${table.kind} = 'break'
          and ${table.mode} = 'pomodoro'
          and ${table.taskId} is null
          and ${table.habitId} is null
          and ${table.plannedSeconds} between 60 and 3600
          and mod(${table.plannedSeconds}, 60) = 0
        )`,
      ),
      check(
        "focus_sessions_accumulated_seconds_check",
        sql`${table.accumulatedActiveSeconds} between 0 and 2147483647`,
      ),
      check(
        "focus_sessions_state_timestamps_check",
        sql`(
          ${table.state} = 'active'
          and ${table.pausedAt} is null
          and ${table.endedAt} is null
        ) or (
          ${table.state} = 'paused'
          and ${table.pausedAt} is not null
          and ${table.pausedAt} >= ${table.startedAt}
          and ${table.endedAt} is null
        ) or (
          ${table.state} = 'completed'
          and ${table.pausedAt} is null
          and ${table.endedAt} is not null
          and ${table.endedAt} >= ${table.startedAt}
        )`,
      ),
      check("focus_sessions_version_check", sql`${table.version} between 1 and 2147483647`),
      uniqueIndex("focus_sessions_one_unfinished_per_user_idx")
        .on(table.userId)
        .where(sql`${table.state} in ('active', 'paused')`),
      index("focus_sessions_completed_history_idx")
        .on(table.userId, table.endedAt.desc(), table.id.desc())
        .where(sql`${table.state} = 'completed' and ${table.kind} = 'focus'`),
      index("focus_sessions_task_owner_idx")
        .on(table.userId, table.taskId)
        .where(sql`${table.taskId} is not null`),
      index("focus_sessions_habit_owner_idx")
        .on(table.userId, table.habitId)
        .where(sql`${table.habitId} is not null`),
    ],
  );

  return { focusSessions };
}
