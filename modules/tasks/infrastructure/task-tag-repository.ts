import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { type DatabaseExecutor, type DatabaseTransaction } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

export type StoredTag = typeof schema.tags.$inferSelect;

export type ReplaceTaskTagsResult =
  | Readonly<{ kind: "updated"; taskId: string; version: number; tags: readonly StoredTag[] }>
  | Readonly<{ kind: "task_not_found" }>
  | Readonly<{ kind: "task_stale"; currentVersion: number }>
  | Readonly<{ kind: "tag_conflict" }>;

export function createTaskTagRepository(defaultExecutor: DatabaseExecutor) {
  return {
    listActiveForTask(userId: string, taskId: string, executor: DatabaseExecutor = defaultExecutor) {
      return listTagsForTask(userId, taskId, executor);
    },

    async replaceForActiveTask(
      input: {
        userId: string;
        taskId: string;
        expectedTaskVersion: number;
        tagIds: readonly string[];
        now: Date;
      },
      transaction: DatabaseTransaction,
    ): Promise<ReplaceTaskTagsResult> {
      if (input.tagIds.length > 100 || new Set(input.tagIds).size !== input.tagIds.length) {
        return { kind: "tag_conflict" };
      }

      const [task] = await transaction
        .select({ id: schema.tasks.id, version: schema.tasks.version })
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.userId, input.userId),
            eq(schema.tasks.id, input.taskId),
            isNull(schema.tasks.deletedAt),
          ),
        )
        .limit(1)
        .for("update");
      if (!task) return { kind: "task_not_found" };
      if (task.version !== input.expectedTaskVersion) {
        return { kind: "task_stale", currentVersion: task.version };
      }

      const tags = await lockActiveTags(input.userId, input.tagIds, transaction);
      if (!tags) return { kind: "tag_conflict" };

      const activeTagIds = transaction
        .select({ id: schema.tags.id })
        .from(schema.tags)
        .where(and(eq(schema.tags.userId, input.userId), isNull(schema.tags.deletedAt)));
      await transaction
        .delete(schema.taskTags)
        .where(
          and(
            eq(schema.taskTags.userId, input.userId),
            eq(schema.taskTags.taskId, input.taskId),
            inArray(schema.taskTags.tagId, activeTagIds),
          ),
        );
      if (input.tagIds.length > 0) {
        await transaction
          .insert(schema.taskTags)
          .values(input.tagIds.map((tagId) => ({ userId: input.userId, taskId: input.taskId, tagId })));
      }

      const [updatedTask] = await transaction
        .update(schema.tasks)
        .set({ updatedAt: input.now, version: sql`${schema.tasks.version} + 1` })
        .where(
          and(
            eq(schema.tasks.userId, input.userId),
            eq(schema.tasks.id, input.taskId),
            eq(schema.tasks.version, input.expectedTaskVersion),
            isNull(schema.tasks.deletedAt),
          ),
        )
        .returning({ version: schema.tasks.version });
      if (!updatedTask) throw new Error("Locked task version changed during tag replacement.");

      return { kind: "updated", taskId: task.id, version: updatedTask.version, tags };
    },
  };
}

function listTagsForTask(userId: string, taskId: string, executor: DatabaseExecutor): Promise<StoredTag[]> {
  return executor
    .select({
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
      schema.tasks,
      and(eq(schema.tasks.id, schema.taskTags.taskId), eq(schema.tasks.userId, schema.taskTags.userId)),
    )
    .innerJoin(
      schema.tags,
      and(eq(schema.tags.id, schema.taskTags.tagId), eq(schema.tags.userId, schema.taskTags.userId)),
    )
    .where(
      and(
        eq(schema.taskTags.userId, userId),
        eq(schema.taskTags.taskId, taskId),
        eq(schema.tasks.userId, userId),
        isNull(schema.tasks.deletedAt),
        eq(schema.tags.userId, userId),
        isNull(schema.tags.deletedAt),
      ),
    )
    .orderBy(asc(sql`lower(${schema.tags.name})`), asc(schema.tags.id));
}

async function lockActiveTags(
  userId: string,
  tagIds: readonly string[],
  transaction: DatabaseTransaction,
): Promise<StoredTag[] | null> {
  if (tagIds.length === 0) return [];
  const tags = await transaction
    .select()
    .from(schema.tags)
    .where(
      and(eq(schema.tags.userId, userId), inArray(schema.tags.id, tagIds), isNull(schema.tags.deletedAt)),
    )
    .orderBy(asc(sql`lower(${schema.tags.name})`), asc(schema.tags.id))
    .for("share");
  return tags.length === tagIds.length ? tags : null;
}
