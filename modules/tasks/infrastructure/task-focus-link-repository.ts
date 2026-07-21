import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDatabase, type DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

export type StoredTaskFocusLink = Readonly<{
  id: string;
  title: string;
  status: string;
  deletedAt: Date | null;
}>;

const selection = {
  id: schema.tasks.id,
  title: schema.tasks.title,
  status: schema.tasks.status,
  deletedAt: schema.tasks.deletedAt,
};

export function createTaskFocusLinkRepository(defaultExecutor: DatabaseExecutor = getDatabase()) {
  return {
    async readOwned(
      userId: string,
      taskId: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskFocusLink | null> {
      const [row] = await executor
        .select(selection)
        .from(schema.tasks)
        .where(and(eq(schema.tasks.userId, userId), eq(schema.tasks.id, taskId)))
        .limit(1);
      return row ?? null;
    },

    async readOwnedMany(
      userId: string,
      taskIds: readonly string[],
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskFocusLink[]> {
      assertBatch(taskIds);
      if (taskIds.length === 0) return [];
      return executor
        .select(selection)
        .from(schema.tasks)
        .where(and(eq(schema.tasks.userId, userId), inArray(schema.tasks.id, taskIds)))
        .orderBy(asc(schema.tasks.id));
    },

    async searchOwned(
      userId: string,
      input: Readonly<{ q: string; limit: number }>,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskFocusLink[]> {
      const pattern = createSearchPattern(input.q);
      assertSearchLimit(input.limit);
      return executor
        .select(selection)
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.userId, userId),
            isNull(schema.tasks.deletedAt),
            sql`lower(${schema.tasks.title}) like ${pattern}`,
          ),
        )
        .orderBy(asc(sql`lower(${schema.tasks.title})`), asc(schema.tasks.id))
        .limit(input.limit);
    },
  } as const;
}

function assertBatch(taskIds: readonly string[]): void {
  if (taskIds.length > 50 || new Set(taskIds).size !== taskIds.length) {
    throw new RangeError("Focus-link task batches must contain at most 50 unique IDs.");
  }
}

function createSearchPattern(rawQuery: string): string {
  const query = rawQuery.trim();
  const codePointLength = Array.from(query).length;
  if (codePointLength < 1 || codePointLength > 120) {
    throw new RangeError("Focus-link search must contain between 1 and 120 Unicode characters.");
  }
  return `%${query.toLowerCase().replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

function assertSearchLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new RangeError("Focus-link search limit must be between 1 and 20.");
  }
}
