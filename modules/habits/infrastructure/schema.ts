import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

type HabitOwnerColumn = () => AnyPgColumn;

const timestampColumn = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const ecmaScriptTrimCharacterLiteral = sql.raw(
  "E'\\u0009\\u000A\\u000B\\u000C\\u000D\\u0020\\u00A0\\u1680\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF'",
);

export function createHabitSchema(authUserId: HabitOwnerColumn) {
  const habits = pgTable(
    "habits",
    {
      id: uuid("id").notNull(),
      userId: uuid("user_id").notNull().references(authUserId, { onDelete: "cascade" }),
      title: text("title").notNull(),
      icon: text("icon").notNull(),
      colorToken: text("color_token").notNull(),
      goalKind: text("goal_kind").notNull(),
      targetValue: numeric("target_value", { precision: 12, scale: 3, mode: "number" }),
      unit: text("unit"),
      version: integer("version").default(1).notNull(),
      createdAt: timestampColumn("created_at").defaultNow().notNull(),
      updatedAt: timestampColumn("updated_at").defaultNow().notNull(),
      archivedAt: timestampColumn("archived_at"),
    },
    (table) => [
      primaryKey({ name: "habits_pkey", columns: [table.userId, table.id] }),
      check("habits_title_check", normalizedTrimmedText(table.title, 200)),
      check("habits_icon_check", normalizedTrimmedText(table.icon, 16)),
      check(
        "habits_color_token_check",
        sql`${table.colorToken} in ('coral', 'amber', 'mint', 'sky', 'violet', 'slate')`,
      ),
      check("habits_goal_kind_check", sql`${table.goalKind} in ('boolean', 'quantity')`),
      check(
        "habits_goal_shape_check",
        sql`(
          ${table.goalKind} = 'boolean'
          and ${table.targetValue} is null
          and ${table.unit} is null
        ) or (
          ${table.goalKind} = 'quantity'
          and ${table.targetValue} is not null
          and ${table.targetValue} between 0.001 and 999999999.999
          and ${table.unit} is not null
          and ${normalizedTrimmedText(table.unit, 40)}
        )`,
      ),
      check("habits_version_check", sql`${table.version} > 0`),
      index("habits_user_active_updated_idx")
        .on(table.userId, table.updatedAt.desc(), table.id)
        .where(sql`${table.archivedAt} is null`),
      index("habits_user_archived_updated_idx")
        .on(table.userId, table.updatedAt.desc(), table.id)
        .where(sql`${table.archivedAt} is not null`),
    ],
  );

  const habitSchedules = pgTable(
    "habit_schedules",
    {
      userId: uuid("user_id").notNull(),
      habitId: uuid("habit_id").notNull(),
      kind: text("kind").notNull(),
      weekdays: smallint("weekdays").array(),
      targetPerWeek: smallint("target_per_week"),
      timezone: text("timezone").notNull(),
      startDate: date("start_date", { mode: "string" }).notNull(),
      endDate: date("end_date", { mode: "string" }),
      createdAt: timestampColumn("created_at").defaultNow().notNull(),
      updatedAt: timestampColumn("updated_at").defaultNow().notNull(),
    },
    (table) => [
      primaryKey({ name: "habit_schedules_pkey", columns: [table.userId, table.habitId] }),
      foreignKey({
        name: "habit_schedules_habit_owner_fk",
        columns: [table.userId, table.habitId],
        foreignColumns: [habits.userId, habits.id],
      }).onDelete("cascade"),
      check("habit_schedules_kind_check", sql`${table.kind} in ('daily', 'weekdays', 'weekly_target')`),
      check(
        "habit_schedules_shape_check",
        sql`(
          ${table.kind} = 'daily'
          and ${table.weekdays} is null
          and ${table.targetPerWeek} is null
        ) or (
          ${table.kind} = 'weekdays'
          and ${table.weekdays} is not null
          and habit_weekdays_are_canonical(${table.weekdays})
          and ${table.targetPerWeek} is null
        ) or (
          ${table.kind} = 'weekly_target'
          and ${table.weekdays} is null
          and ${table.targetPerWeek} is not null
          and ${table.targetPerWeek} between 1 and 7
        )`,
      ),
      check(
        "habit_schedules_timezone_check",
        sql`char_length(${table.timezone}) between 1 and 128 and habit_timezone_is_valid(${table.timezone})`,
      ),
      check(
        "habit_schedules_date_bounds_check",
        sql`${table.startDate} between date '0001-01-01' and date '9999-12-31'
          and (${table.endDate} is null or (
            ${table.endDate} between date '0001-01-01' and date '9999-12-31'
            and ${table.endDate} >= ${table.startDate}
          ))`,
      ),
      index("habit_schedules_user_dates_idx").on(table.userId, table.startDate, table.endDate, table.habitId),
    ],
  );

  const habitLogs = pgTable(
    "habit_logs",
    {
      id: uuid("id").notNull(),
      userId: uuid("user_id").notNull().references(authUserId, { onDelete: "cascade" }),
      habitId: uuid("habit_id").notNull(),
      localDate: date("local_date", { mode: "string" }).notNull(),
      state: text("state").notNull(),
      quantity: numeric("quantity", { precision: 12, scale: 3, mode: "number" }),
      note: text("note"),
      version: integer("version").default(1).notNull(),
      createdAt: timestampColumn("created_at").defaultNow().notNull(),
      updatedAt: timestampColumn("updated_at").defaultNow().notNull(),
    },
    (table) => [
      primaryKey({ name: "habit_logs_pkey", columns: [table.userId, table.id] }),
      unique("habit_logs_user_habit_date_unique").on(table.userId, table.habitId, table.localDate),
      foreignKey({
        name: "habit_logs_habit_owner_fk",
        columns: [table.userId, table.habitId],
        foreignColumns: [habits.userId, habits.id],
      }).onDelete("cascade"),
      check("habit_logs_state_check", sql`${table.state} in ('completed', 'skipped', 'unachieved')`),
      check(
        "habit_logs_quantity_check",
        sql`(${table.state} = 'completed' and (
          ${table.quantity} is null or ${table.quantity} between 0 and 999999999.999
        )) or (${table.state} in ('skipped', 'unachieved') and ${table.quantity} is null)`,
      ),
      check(
        "habit_logs_note_check",
        sql`${table.note} is null or (
          ${table.note} = normalize(${table.note}, NFC)
          and char_length(${table.note}) <= 1000
        )`,
      ),
      check("habit_logs_version_check", sql`${table.version} > 0`),
      check(
        "habit_logs_local_date_check",
        sql`${table.localDate} between date '0001-01-01' and date '9999-12-31'`,
      ),
      index("habit_logs_user_local_date_idx").on(table.userId, table.localDate, table.habitId),
    ],
  );

  return { habits, habitSchedules, habitLogs };
}

function normalizedTrimmedText(column: AnyPgColumn, maximumLength: number) {
  return sql`${column} = normalize(${column}, NFC)
    and ${column} = btrim(${column}, ${ecmaScriptTrimCharacterLiteral})
    and char_length(${column}) between 1 and ${sql.raw(String(maximumLength))}`;
}
