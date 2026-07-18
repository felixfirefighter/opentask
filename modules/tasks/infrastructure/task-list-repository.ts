import { and, eq, isNull } from "drizzle-orm";

import { getDatabase, type DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

export type StoredInbox = { id: string; name: string; kind: string; version: number };

export type TaskListRepository = ReturnType<typeof createTaskListRepository>;

export function createTaskListRepository(defaultExecutor: DatabaseExecutor = getDatabase()) {
  return {
    async findInbox(
      userId: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredInbox | null> {
      const [row] = await executor
        .select({
          id: schema.taskLists.id,
          name: schema.taskLists.name,
          kind: schema.taskLists.kind,
          version: schema.taskLists.version,
        })
        .from(schema.taskLists)
        .where(
          and(
            eq(schema.taskLists.userId, userId),
            eq(schema.taskLists.kind, "inbox"),
            isNull(schema.taskLists.deletedAt),
          ),
        )
        .limit(1);

      return row ?? null;
    },

    async insertInbox(
      input: { id: string; userId: string; createdAt: Date },
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<void> {
      await executor
        .insert(schema.taskLists)
        .values({
          id: input.id,
          userId: input.userId,
          name: "Inbox",
          colorToken: "slate",
          rank: "a0",
          kind: "inbox",
          version: 1,
          createdAt: input.createdAt,
          updatedAt: input.createdAt,
          deletedAt: null,
        })
        .onConflictDoNothing();
    },
  };
}
