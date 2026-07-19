import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

type TaskOwnershipColumns = Readonly<{ userId: AnyPgColumn; id: AnyPgColumn }>;
export type TaskScheduleTable = ReturnType<typeof createTaskScheduleTable>;

const timestampColumn = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const rankText = customType<{ data: string }>({
  dataType: () => 'text collate "C"',
});
const ecmaScriptTrimCharacterLiteral = sql.raw(
  "E'\\u0009\\u000A\\u000B\\u000C\\u000D\\u0020\\u00A0\\u1680\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF'",
);

export function createTaskSchema(authUserId: () => AnyPgColumn) {
  const listFolders = pgTable(
    "list_folders",
    {
      id: uuid("id").notNull(),
      userId: uuid("user_id").notNull().references(authUserId, { onDelete: "cascade" }),
      name: text("name").notNull(),
      rank: rankText("rank").notNull(),
      version: integer("version").default(1).notNull(),
      createdAt: timestampColumn("created_at").defaultNow().notNull(),
      updatedAt: timestampColumn("updated_at").defaultNow().notNull(),
      deletedAt: timestampColumn("deleted_at"),
    },
    (table) => [
      primaryKey({ name: "list_folders_pkey", columns: [table.userId, table.id] }),
      check("list_folders_name_check", boundedTrimmed(table.name, 120)),
      check("list_folders_rank_check", boundedTrimmed(table.rank, 128)),
      check("list_folders_version_check", sql`${table.version} > 0`),
      index("list_folders_user_active_rank_idx")
        .on(table.userId, table.rank, table.id)
        .where(sql`${table.deletedAt} is null`),
    ],
  );

  const taskLists = pgTable(
    "task_lists",
    {
      id: uuid("id").notNull(),
      userId: uuid("user_id").notNull().references(authUserId, { onDelete: "cascade" }),
      folderId: uuid("folder_id"),
      name: text("name").notNull(),
      colorToken: text("color_token").notNull(),
      rank: rankText("rank").notNull(),
      kind: text("kind").notNull(),
      version: integer("version").default(1).notNull(),
      createdAt: timestampColumn("created_at").defaultNow().notNull(),
      updatedAt: timestampColumn("updated_at").defaultNow().notNull(),
      deletedAt: timestampColumn("deleted_at"),
    },
    (table) => [
      primaryKey({ name: "task_lists_pkey", columns: [table.userId, table.id] }),
      foreignKey({
        name: "task_lists_folder_owner_fk",
        columns: [table.userId, table.folderId],
        foreignColumns: [listFolders.userId, listFolders.id],
      }).onDelete("no action"),
      check("task_lists_kind_check", sql`${table.kind} in ('inbox', 'regular')`),
      check("task_lists_inbox_folder_check", sql`${table.kind} <> 'inbox' or ${table.folderId} is null`),
      check("task_lists_name_check", boundedTrimmed(table.name, 120)),
      check("task_lists_color_token_check", colorTokenCheck(table.colorToken)),
      check("task_lists_rank_check", boundedTrimmed(table.rank, 128)),
      check("task_lists_version_check", sql`${table.version} > 0`),
      index("task_lists_folder_owner_idx").on(table.userId, table.folderId),
      index("task_lists_user_folder_active_rank_idx")
        .on(table.userId, table.folderId, table.rank, table.id)
        .where(sql`${table.deletedAt} is null`),
      uniqueIndex("task_lists_one_active_inbox_per_user_idx")
        .on(table.userId)
        .where(sql`${table.kind} = 'inbox' and ${table.deletedAt} is null`),
    ],
  );

  const listSections = pgTable(
    "list_sections",
    {
      id: uuid("id").notNull(),
      userId: uuid("user_id").notNull().references(authUserId, { onDelete: "cascade" }),
      listId: uuid("list_id").notNull(),
      name: text("name").notNull(),
      rank: rankText("rank").notNull(),
      version: integer("version").default(1).notNull(),
      createdAt: timestampColumn("created_at").defaultNow().notNull(),
      updatedAt: timestampColumn("updated_at").defaultNow().notNull(),
    },
    (table) => [
      primaryKey({ name: "list_sections_pkey", columns: [table.userId, table.id] }),
      unique("list_sections_user_id_list_unique").on(table.userId, table.id, table.listId),
      foreignKey({
        name: "list_sections_list_owner_fk",
        columns: [table.userId, table.listId],
        foreignColumns: [taskLists.userId, taskLists.id],
      }).onDelete("no action"),
      check("list_sections_name_check", boundedTrimmed(table.name, 120)),
      check("list_sections_rank_check", boundedTrimmed(table.rank, 128)),
      check("list_sections_version_check", sql`${table.version} > 0`),
      index("list_sections_user_list_rank_idx").on(table.userId, table.listId, table.rank, table.id),
    ],
  );

  const tasks = pgTable(
    "tasks",
    {
      id: uuid("id").notNull(),
      userId: uuid("user_id").notNull().references(authUserId, { onDelete: "cascade" }),
      listId: uuid("list_id").notNull(),
      sectionId: uuid("section_id"),
      parentTaskId: uuid("parent_task_id"),
      title: text("title").notNull(),
      descriptionMd: text("description_md").notNull(),
      status: text("status").default("open").notNull(),
      priority: text("priority").default("none").notNull(),
      rank: rankText("rank").notNull(),
      statusChangedAt: timestampColumn("status_changed_at").defaultNow().notNull(),
      version: integer("version").default(1).notNull(),
      createdAt: timestampColumn("created_at").defaultNow().notNull(),
      updatedAt: timestampColumn("updated_at").defaultNow().notNull(),
      deletedAt: timestampColumn("deleted_at"),
    },
    (table) => [
      primaryKey({ name: "tasks_pkey", columns: [table.userId, table.id] }),
      unique("tasks_user_id_list_unique").on(table.userId, table.id, table.listId),
      foreignKey({
        name: "tasks_list_owner_fk",
        columns: [table.userId, table.listId],
        foreignColumns: [taskLists.userId, taskLists.id],
      }).onDelete("no action"),
      foreignKey({
        name: "tasks_section_owner_list_fk",
        columns: [table.userId, table.sectionId, table.listId],
        foreignColumns: [listSections.userId, listSections.id, listSections.listId],
      }).onDelete("no action"),
      foreignKey({
        name: "tasks_parent_owner_list_fk",
        columns: [table.userId, table.parentTaskId, table.listId],
        foreignColumns: [table.userId, table.id, table.listId],
      }).onDelete("no action"),
      check("tasks_title_check", boundedTrimmed(table.title, 500)),
      check("tasks_description_md_check", sql`char_length(${table.descriptionMd}) <= 20000`),
      check("tasks_status_check", sql`${table.status} in ('open', 'completed', 'cancelled')`),
      check("tasks_priority_check", sql`${table.priority} in ('none', 'low', 'medium', 'high')`),
      check("tasks_rank_check", boundedTrimmed(table.rank, 128)),
      check(
        "tasks_parent_not_self_check",
        sql`${table.parentTaskId} is null or ${table.parentTaskId} <> ${table.id}`,
      ),
      check("tasks_version_check", sql`${table.version} > 0`),
      index("tasks_list_owner_idx").on(table.userId, table.listId),
      index("tasks_section_owner_list_idx").on(table.userId, table.sectionId, table.listId),
      index("tasks_parent_owner_list_idx").on(table.userId, table.parentTaskId, table.listId),
      index("tasks_user_active_rank_idx")
        .on(table.userId, table.listId, table.parentTaskId, table.sectionId, table.rank, table.id)
        .where(sql`${table.deletedAt} is null`),
      index("tasks_user_list_parent_active_rank_idx")
        .on(table.userId, table.listId, table.parentTaskId, table.rank, table.id)
        .where(sql`${table.parentTaskId} is not null and ${table.deletedAt} is null`),
      index("tasks_user_status_changed_idx")
        .on(table.userId, table.status, table.statusChangedAt, table.id)
        .where(sql`${table.deletedAt} is null`),
      index("tasks_title_search_idx")
        .using("gin", sql`lower(${table.title}) public.gin_trgm_ops`)
        .where(sql`${table.deletedAt} is null`),
      index("tasks_description_search_idx")
        .using("gin", sql`lower(${table.descriptionMd}) public.gin_trgm_ops`)
        .where(sql`${table.deletedAt} is null`),
    ],
  );

  const taskSchedules = createTaskScheduleTable(tasks);

  const checklistItems = pgTable(
    "checklist_items",
    {
      id: uuid("id").notNull(),
      userId: uuid("user_id").notNull().references(authUserId, { onDelete: "cascade" }),
      taskId: uuid("task_id").notNull(),
      title: text("title").notNull(),
      isCompleted: boolean("is_completed").default(false).notNull(),
      rank: rankText("rank").notNull(),
      version: integer("version").default(1).notNull(),
      createdAt: timestampColumn("created_at").defaultNow().notNull(),
      updatedAt: timestampColumn("updated_at").defaultNow().notNull(),
    },
    (table) => [
      primaryKey({ name: "checklist_items_pkey", columns: [table.userId, table.id] }),
      foreignKey({
        name: "checklist_items_task_owner_fk",
        columns: [table.userId, table.taskId],
        foreignColumns: [tasks.userId, tasks.id],
      }).onDelete("cascade"),
      check("checklist_items_title_check", boundedTrimmed(table.title, 500)),
      check("checklist_items_rank_check", boundedTrimmed(table.rank, 128)),
      check("checklist_items_version_check", sql`${table.version} > 0`),
      index("checklist_items_task_owner_rank_idx").on(table.userId, table.taskId, table.rank, table.id),
    ],
  );

  const tags = pgTable(
    "tags",
    {
      id: uuid("id").notNull(),
      userId: uuid("user_id").notNull().references(authUserId, { onDelete: "cascade" }),
      name: text("name").notNull(),
      colorToken: text("color_token").notNull(),
      version: integer("version").default(1).notNull(),
      createdAt: timestampColumn("created_at").defaultNow().notNull(),
      updatedAt: timestampColumn("updated_at").defaultNow().notNull(),
      deletedAt: timestampColumn("deleted_at"),
    },
    (table) => [
      primaryKey({ name: "tags_pkey", columns: [table.userId, table.id] }),
      check("tags_name_check", boundedTrimmed(table.name, 120)),
      check("tags_color_token_check", colorTokenCheck(table.colorToken)),
      check("tags_version_check", sql`${table.version} > 0`),
      index("tags_user_active_idx")
        .on(table.userId, table.id)
        .where(sql`${table.deletedAt} is null`),
      uniqueIndex("tags_user_active_normalized_name_idx")
        .on(table.userId, sql`lower(normalize(${table.name}, NFKC))`)
        .where(sql`${table.deletedAt} is null`),
      index("tags_name_search_idx")
        .using("gin", sql`lower(${table.name}) public.gin_trgm_ops`)
        .where(sql`${table.deletedAt} is null`),
    ],
  );

  const taskTags = pgTable(
    "task_tags",
    {
      userId: uuid("user_id").notNull().references(authUserId, { onDelete: "cascade" }),
      taskId: uuid("task_id").notNull(),
      tagId: uuid("tag_id").notNull(),
    },
    (table) => [
      primaryKey({ name: "task_tags_pk", columns: [table.userId, table.taskId, table.tagId] }),
      foreignKey({
        name: "task_tags_task_owner_fk",
        columns: [table.userId, table.taskId],
        foreignColumns: [tasks.userId, tasks.id],
      }).onDelete("cascade"),
      foreignKey({
        name: "task_tags_tag_owner_fk",
        columns: [table.userId, table.tagId],
        foreignColumns: [tags.userId, tags.id],
      }).onDelete("cascade"),
      index("task_tags_tag_owner_idx").on(table.userId, table.tagId),
    ],
  );

  return { listFolders, taskLists, listSections, tasks, taskSchedules, checklistItems, tags, taskTags };
}

function createTaskScheduleTable(tasks: TaskOwnershipColumns) {
  return pgTable(
    "task_schedules",
    {
      userId: uuid("user_id").notNull(),
      taskId: uuid("task_id").notNull(),
      kind: text("kind").notNull(),
      startDate: date("start_date", { mode: "string" }),
      endDate: date("end_date", { mode: "string" }),
      startAt: timestampColumn("start_at"),
      endAt: timestampColumn("end_at"),
      timezone: text("timezone"),
      createdAt: timestampColumn("created_at").defaultNow().notNull(),
      updatedAt: timestampColumn("updated_at").defaultNow().notNull(),
    },
    (table) => [
      primaryKey({ name: "task_schedules_pkey", columns: [table.userId, table.taskId] }),
      foreignKey({
        name: "task_schedules_task_owner_fk",
        columns: [table.userId, table.taskId],
        foreignColumns: [tasks.userId, tasks.id],
      }).onDelete("cascade"),
      check("task_schedules_kind_check", sql`${table.kind} in ('all_day', 'timed')`),
      check(
        "task_schedules_shape_check",
        sql`(
          ${table.kind} = 'all_day'
          and ${table.startDate} is not null
          and ${table.endDate} is not null
          and ${table.startAt} is null
          and ${table.endAt} is null
          and ${table.timezone} is null
        ) or (
          ${table.kind} = 'timed'
          and ${table.startDate} is null
          and ${table.endDate} is null
          and ${table.startAt} is not null
          and ${table.endAt} is not null
          and ${table.timezone} is not null
        )`,
      ),
      check(
        "task_schedules_bounds_check",
        sql`(${table.kind} = 'all_day' and ${table.endDate} > ${table.startDate})
          or (${table.kind} = 'timed' and ${table.endAt} >= ${table.startAt})`,
      ),
      check(
        "task_schedules_timezone_check",
        sql`${table.timezone} is null or char_length(${table.timezone}) between 1 and 128`,
      ),
      index("task_schedules_user_start_date_idx")
        .on(table.userId, table.startDate, table.taskId)
        .where(sql`${table.kind} = 'all_day'`),
      index("task_schedules_user_end_date_idx")
        .on(table.userId, table.endDate, table.taskId)
        .where(sql`${table.kind} = 'all_day'`),
      index("task_schedules_user_start_at_idx")
        .on(table.userId, table.startAt, table.taskId)
        .where(sql`${table.kind} = 'timed'`),
      index("task_schedules_user_end_at_idx")
        .on(table.userId, table.endAt, table.taskId)
        .where(sql`${table.kind} = 'timed'`),
    ],
  );
}

function boundedTrimmed(column: AnyPgColumn, maximum: number) {
  return sql`${column} = btrim(${column}, ${ecmaScriptTrimCharacterLiteral}) and char_length(${column}) between 1 and ${sql.raw(String(maximum))}`;
}

function colorTokenCheck(column: AnyPgColumn) {
  return sql`${column} in ('coral', 'amber', 'mint', 'sky', 'violet', 'slate')`;
}
