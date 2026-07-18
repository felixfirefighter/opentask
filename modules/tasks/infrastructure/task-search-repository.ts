import { and, desc, eq, getTableColumns, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { getDatabase, type DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

import type { StoredTag } from "./tag-repository";

export type StoredSearchTask = typeof schema.tasks.$inferSelect;
export type TaskSearchMatchField = "title" | "description" | "tag";
export type TaskSearchCursor = Readonly<{ updatedAt: Date; id: string }>;

export type StoredTaskSearchResult = Readonly<{
  task: StoredSearchTask;
  list: Readonly<{ id: string; name: string }>;
  matchedFields: readonly TaskSearchMatchField[];
  matchingTags: readonly StoredTag[];
}>;

export type StoredTaskSearchPage = Readonly<{
  items: readonly StoredTaskSearchResult[];
  next: TaskSearchCursor | null;
}>;

export function createTaskSearchRepository(defaultExecutor: DatabaseExecutor = getDatabase()) {
  return {
    async search(
      userId: string,
      input: { q: string; limit: number; after?: TaskSearchCursor },
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskSearchPage> {
      const pattern = createSearchPattern(input.q);
      assertSearchLimit(input.limit);
      const titleMatch = sql<boolean>`lower(${schema.tasks.title}) like ${pattern}`;
      const descriptionMatch = sql<boolean>`lower(${schema.tasks.descriptionMd}) like ${pattern}`;
      const tagMatch = matchingTagExists(userId, pattern);
      const after = input.after;

      const rows = await executor
        .select({
          ...getTableColumns(schema.tasks),
          listName: schema.taskLists.name,
          titleMatched: titleMatch,
          descriptionMatched: descriptionMatch,
          tagMatched: tagMatch,
        })
        .from(schema.tasks)
        .innerJoin(
          schema.taskLists,
          and(eq(schema.taskLists.id, schema.tasks.listId), eq(schema.taskLists.userId, schema.tasks.userId)),
        )
        .where(
          and(
            eq(schema.tasks.userId, userId),
            eq(schema.taskLists.userId, userId),
            isNull(schema.tasks.deletedAt),
            after
              ? or(
                  lt(schema.tasks.updatedAt, after.updatedAt),
                  and(eq(schema.tasks.updatedAt, after.updatedAt), lt(schema.tasks.id, after.id)),
                )
              : undefined,
            or(titleMatch, descriptionMatch, tagMatch),
          ),
        )
        .orderBy(desc(schema.tasks.updatedAt), desc(schema.tasks.id))
        .limit(input.limit + 1);

      const hasMore = rows.length > input.limit;
      const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
      const matchingTags = await findMatchingTags(
        userId,
        pageRows.map((row) => row.id),
        pattern,
        executor,
      );

      const items = pageRows.map((row): StoredTaskSearchResult => {
        const tags = matchingTags.get(row.id) ?? [];
        const matchedFields: TaskSearchMatchField[] = [];
        if (row.titleMatched) matchedFields.push("title");
        if (row.descriptionMatched) matchedFields.push("description");
        if (row.tagMatched) matchedFields.push("tag");
        const task = mapStoredTask(row);
        return {
          task,
          list: { id: task.listId, name: row.listName },
          matchedFields,
          matchingTags: tags,
        };
      });
      const last = items.at(-1)?.task;

      return {
        items,
        next: hasMore && last ? { updatedAt: last.updatedAt, id: last.id } : null,
      };
    },
  };
}

function matchingTagExists(userId: string, pattern: string) {
  return sql<boolean>`exists (
    select 1
      from ${schema.taskTags}
      inner join ${schema.tags}
        on ${schema.tags.id} = ${schema.taskTags.tagId}
       and ${schema.tags.userId} = ${schema.taskTags.userId}
     where ${schema.taskTags.userId} = ${userId}
       and ${schema.taskTags.taskId} = ${schema.tasks.id}
       and ${schema.tags.userId} = ${userId}
       and ${schema.tags.deletedAt} is null
       and lower(${schema.tags.name}) like ${pattern}
  )`;
}

async function findMatchingTags(
  userId: string,
  taskIds: readonly string[],
  pattern: string,
  executor: DatabaseExecutor,
): Promise<Map<string, StoredTag[]>> {
  if (taskIds.length === 0) return new Map();
  const rows = await executor
    .select({
      taskId: schema.taskTags.taskId,
      id: schema.tags.id,
      userId: schema.tags.userId,
      name: schema.tags.name,
      colorToken: schema.tags.colorToken,
      version: schema.tags.version,
      createdAt: schema.tags.createdAt,
      updatedAt: schema.tags.updatedAt,
      deletedAt: schema.tags.deletedAt,
    })
    .from(schema.taskTags)
    .innerJoin(
      schema.tags,
      and(eq(schema.tags.id, schema.taskTags.tagId), eq(schema.tags.userId, schema.taskTags.userId)),
    )
    .where(
      and(
        eq(schema.taskTags.userId, userId),
        inArray(schema.taskTags.taskId, taskIds),
        eq(schema.tags.userId, userId),
        isNull(schema.tags.deletedAt),
        sql`lower(${schema.tags.name}) like ${pattern}`,
      ),
    )
    .orderBy(schema.taskTags.taskId, sql`lower(${schema.tags.name})`, schema.tags.id);

  const byTask = new Map<string, StoredTag[]>();
  for (const { taskId, ...tag } of rows) {
    const tags = byTask.get(taskId) ?? [];
    tags.push(tag);
    byTask.set(taskId, tags);
  }
  return byTask;
}

function createSearchPattern(query: string): string {
  const trimmed = query.trim();
  const codePointLength = Array.from(trimmed).length;
  if (codePointLength < 1 || codePointLength > 120) {
    throw new RangeError("Search query must contain between 1 and 120 characters.");
  }
  const normalized = trimmed.toLowerCase();
  return `%${normalized.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

function assertSearchLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new RangeError("Search page limit must be between 1 and 50.");
  }
}

function mapStoredTask(row: StoredSearchTask): StoredSearchTask {
  return {
    id: row.id,
    userId: row.userId,
    listId: row.listId,
    sectionId: row.sectionId,
    parentTaskId: row.parentTaskId,
    title: row.title,
    descriptionMd: row.descriptionMd,
    status: row.status,
    priority: row.priority,
    rank: row.rank,
    statusChangedAt: row.statusChangedAt,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}
