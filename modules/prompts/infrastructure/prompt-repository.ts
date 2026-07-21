import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import type { Database, DatabaseExecutor } from "@/shared/db/client";

import type { createPromptsSchema } from "./schema";

type PromptsSchema = ReturnType<typeof createPromptsSchema>;

export function createPromptRepository(database: Database, tables: PromptsSchema) {
  const { savedPrompts, savedPromptTags } = tables;
  const promptFields = {
    id: savedPrompts.id,
    title: savedPrompts.title,
    description: savedPrompts.description,
    content: savedPrompts.content,
    version: savedPrompts.version,
    createdAt: savedPrompts.createdAt,
    updatedAt: savedPrompts.updatedAt,
    archivedAt: savedPrompts.archivedAt,
  };

  return {
    list(userId: string, includeArchived = false) {
      return database
        .select(promptFields)
        .from(savedPrompts)
        .where(
          and(eq(savedPrompts.userId, userId), ...(includeArchived ? [] : [isNull(savedPrompts.archivedAt)])),
        )
        .orderBy(desc(savedPrompts.updatedAt));
    },
    find(userId: string, id: string) {
      return database
        .select(promptFields)
        .from(savedPrompts)
        .where(and(eq(savedPrompts.userId, userId), eq(savedPrompts.id, id)))
        .then((rows) => rows[0] ?? null);
    },
    tagsFor(userId: string, promptIds: readonly string[]) {
      if (promptIds.length === 0) return Promise.resolve([]);
      return database
        .select({ promptId: savedPromptTags.promptId, name: savedPromptTags.name })
        .from(savedPromptTags)
        .where(and(eq(savedPromptTags.userId, userId), inArray(savedPromptTags.promptId, [...promptIds])));
    },
    insert(
      values: { id: string; userId: string; title: string; description: string; content: string; now: Date },
      executor: DatabaseExecutor,
    ) {
      return executor
        .insert(savedPrompts)
        .values({ ...values, createdAt: values.now, updatedAt: values.now })
        .returning(promptFields);
    },
    replaceTags(
      userId: string,
      promptId: string,
      tags: readonly { name: string; normalizedName: string }[],
      executor: DatabaseExecutor,
    ) {
      return executor
        .delete(savedPromptTags)
        .where(and(eq(savedPromptTags.userId, userId), eq(savedPromptTags.promptId, promptId)))
        .then(async () => {
          if (tags.length === 0) return;
          await executor.insert(savedPromptTags).values(tags.map((tag) => ({ ...tag, userId, promptId })));
        });
    },
    update(
      userId: string,
      id: string,
      version: number,
      values: { title: string; description: string; content: string; archivedAt: Date | null; now: Date },
      executor: DatabaseExecutor,
    ) {
      return executor
        .update(savedPrompts)
        .set({
          title: values.title,
          description: values.description,
          content: values.content,
          archivedAt: values.archivedAt,
          updatedAt: values.now,
          version: version + 1,
        })
        .where(
          and(eq(savedPrompts.userId, userId), eq(savedPrompts.id, id), eq(savedPrompts.version, version)),
        )
        .returning(promptFields);
    },
    delete(userId: string, id: string) {
      return database
        .delete(savedPrompts)
        .where(and(eq(savedPrompts.userId, userId), eq(savedPrompts.id, id)))
        .returning({ id: savedPrompts.id });
    },
  } as const;
}
