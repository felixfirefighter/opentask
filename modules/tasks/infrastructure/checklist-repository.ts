import { and, asc, eq, sql } from "drizzle-orm";

import { getDatabase, type DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

export type StoredChecklistItem = typeof schema.checklistItems.$inferSelect;

export type ChecklistWriteResult =
  | Readonly<{ outcome: "applied"; item: StoredChecklistItem }>
  | Readonly<{ outcome: "not-found" }>
  | Readonly<{ outcome: "stale"; currentVersion: number }>;

type VersionedChecklistWrite = Readonly<{
  userId: string;
  taskId: string;
  id: string;
  expectedVersion: number;
  now: Date;
}>;

type ChecklistChanges = Partial<Pick<StoredChecklistItem, "title" | "isCompleted" | "rank">>;

export function createChecklistRepository(defaultExecutor: DatabaseExecutor = getDatabase()) {
  return {
    async findById(userId: string, taskId: string, id: string, executor: DatabaseExecutor = defaultExecutor) {
      const [row] = await executor
        .select()
        .from(schema.checklistItems)
        .where(checklistIdentity(userId, taskId, id))
        .limit(1);
      return row ?? null;
    },

    async lockById(userId: string, taskId: string, id: string, executor: DatabaseExecutor = defaultExecutor) {
      const [row] = await executor
        .select()
        .from(schema.checklistItems)
        .where(checklistIdentity(userId, taskId, id))
        .limit(1)
        .for("update");
      return row ?? null;
    },

    listByTask(userId: string, taskId: string, executor: DatabaseExecutor = defaultExecutor) {
      return executor
        .select()
        .from(schema.checklistItems)
        .where(and(eq(schema.checklistItems.userId, userId), eq(schema.checklistItems.taskId, taskId)))
        .orderBy(asc(schema.checklistItems.rank), asc(schema.checklistItems.id));
    },

    async insert(
      input: {
        id: string;
        userId: string;
        taskId: string;
        title: string;
        rank: string;
        now: Date;
      },
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      const [row] = await executor
        .insert(schema.checklistItems)
        .values({
          id: input.id,
          userId: input.userId,
          taskId: input.taskId,
          title: input.title,
          isCompleted: false,
          rank: input.rank,
          version: 1,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .onConflictDoNothing({ target: [schema.checklistItems.userId, schema.checklistItems.id] })
        .returning();
      return row ?? null;
    },

    updateDetails(
      input: VersionedChecklistWrite & {
        patch: Readonly<{ title?: string; isCompleted?: boolean }>;
      },
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      if (Object.values(input.patch).every((value) => value === undefined)) {
        throw new RangeError("Checklist patch cannot be empty.");
      }
      return mutateChecklistItem(input, input.patch, executor);
    },

    updateRank(
      input: VersionedChecklistWrite & { rank: string },
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      return mutateChecklistItem(input, { rank: input.rank }, executor);
    },

    async rewriteRanks(
      userId: string,
      taskId: string,
      updates: readonly { id: string; expectedVersion: number; rank: string }[],
      now: Date,
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      const results: ChecklistWriteResult[] = [];
      for (const update of updates) {
        results.push(
          await mutateChecklistItem(
            { userId, taskId, id: update.id, expectedVersion: update.expectedVersion, now },
            { rank: update.rank },
            executor,
          ),
        );
      }
      return results;
    },

    async hardDelete(
      input: Omit<VersionedChecklistWrite, "now">,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<ChecklistWriteResult> {
      const [row] = await executor
        .delete(schema.checklistItems)
        .where(
          and(
            checklistIdentity(input.userId, input.taskId, input.id),
            eq(schema.checklistItems.version, input.expectedVersion),
          ),
        )
        .returning();
      if (row) return { outcome: "applied", item: row };
      return classifyChecklistWriteMiss(input, executor);
    },
  };
}

async function mutateChecklistItem(
  input: VersionedChecklistWrite,
  changes: ChecklistChanges,
  executor: DatabaseExecutor,
): Promise<ChecklistWriteResult> {
  const [row] = await executor
    .update(schema.checklistItems)
    .set({ ...changes, updatedAt: input.now, version: sql`${schema.checklistItems.version} + 1` })
    .where(
      and(
        checklistIdentity(input.userId, input.taskId, input.id),
        eq(schema.checklistItems.version, input.expectedVersion),
      ),
    )
    .returning();
  if (row) return { outcome: "applied", item: row };
  return classifyChecklistWriteMiss(input, executor);
}

async function classifyChecklistWriteMiss(
  input: Pick<VersionedChecklistWrite, "userId" | "taskId" | "id" | "expectedVersion">,
  executor: DatabaseExecutor,
): Promise<ChecklistWriteResult> {
  const [current] = await executor
    .select({ version: schema.checklistItems.version })
    .from(schema.checklistItems)
    .where(checklistIdentity(input.userId, input.taskId, input.id))
    .limit(1);
  return current ? { outcome: "stale", currentVersion: current.version } : { outcome: "not-found" };
}

function checklistIdentity(userId: string, taskId: string, id: string) {
  return and(
    eq(schema.checklistItems.userId, userId),
    eq(schema.checklistItems.taskId, taskId),
    eq(schema.checklistItems.id, id),
  );
}
