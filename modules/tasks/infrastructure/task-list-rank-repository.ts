import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { type DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

type StoredTaskList = typeof schema.taskLists.$inferSelect;

export function createTaskListRankRepository(defaultExecutor: DatabaseExecutor) {
  return {
    async listActiveRanks(
      userId: string,
      folderId: string | null,
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      return executor
        .select({ id: schema.taskLists.id, rank: schema.taskLists.rank })
        .from(schema.taskLists)
        .where(
          and(
            eq(schema.taskLists.userId, userId),
            eq(schema.taskLists.kind, "regular"),
            nullableEquals(schema.taskLists.folderId, folderId),
            isNull(schema.taskLists.deletedAt),
          ),
        )
        .orderBy(asc(schema.taskLists.rank), asc(schema.taskLists.id));
    },

    async rewriteRanks(
      userId: string,
      folderId: string | null,
      updates: readonly { id: string; rank: string }[],
      now: Date,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskList[]> {
      const rows: StoredTaskList[] = [];
      for (const update of updates) {
        const [row] = await executor
          .update(schema.taskLists)
          .set({
            rank: update.rank,
            updatedAt: now,
            version: sql`${schema.taskLists.version} + 1`,
          })
          .where(
            and(
              eq(schema.taskLists.userId, userId),
              eq(schema.taskLists.id, update.id),
              eq(schema.taskLists.kind, "regular"),
              nullableEquals(schema.taskLists.folderId, folderId),
              isNull(schema.taskLists.deletedAt),
            ),
          )
          .returning();
        if (row) rows.push(row);
      }
      return rows;
    },
  };
}

function nullableEquals(column: typeof schema.taskLists.folderId, value: string | null) {
  return value === null ? isNull(column) : eq(column, value);
}
