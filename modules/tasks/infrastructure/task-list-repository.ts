import { and, asc, eq, gt, isNotNull, isNull, or, sql } from "drizzle-orm";

import { getDatabase, type DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

import { createTaskListInboxRepository } from "./task-list-inbox-repository";
import { createTaskListRankRepository } from "./task-list-rank-repository";

export type { StoredInbox } from "./task-list-inbox-repository";
export type StoredTaskList = typeof schema.taskLists.$inferSelect;
export type StoredRegularListProjection = Readonly<{
  list: StoredTaskList;
  effectiveFolderId: string | null;
}>;

export type TaskListRepository = ReturnType<typeof createTaskListRepository>;

export function createTaskListRepository(defaultExecutor: DatabaseExecutor = getDatabase()) {
  return {
    ...createTaskListInboxRepository(defaultExecutor),
    ...createTaskListRankRepository(defaultExecutor),

    async findRegularById(
      userId: string,
      id: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskList | null> {
      return findRegularList(userId, id, executor);
    },

    async findActiveById(
      userId: string,
      id: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskList | null> {
      const [row] = await executor
        .select()
        .from(schema.taskLists)
        .where(
          and(
            eq(schema.taskLists.userId, userId),
            eq(schema.taskLists.id, id),
            isNull(schema.taskLists.deletedAt),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async lockById(
      userId: string,
      id: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskList | null> {
      const [row] = await executor
        .select()
        .from(schema.taskLists)
        .where(and(eq(schema.taskLists.userId, userId), eq(schema.taskLists.id, id)))
        .limit(1)
        .for("update");
      return row ?? null;
    },

    async listActiveRegular(
      userId: string,
      page: { limit: number; after?: { rank: string; id: string } },
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredRegularListProjection[]> {
      const after = page.after;
      const rows = await executor
        .select({ list: schema.taskLists, activeFolderId: schema.listFolders.id })
        .from(schema.taskLists)
        .leftJoin(
          schema.listFolders,
          and(
            eq(schema.listFolders.id, schema.taskLists.folderId),
            eq(schema.listFolders.userId, schema.taskLists.userId),
            isNull(schema.listFolders.deletedAt),
          ),
        )
        .where(
          and(
            eq(schema.taskLists.userId, userId),
            eq(schema.taskLists.kind, "regular"),
            isNull(schema.taskLists.deletedAt),
            after
              ? or(
                  gt(schema.taskLists.rank, after.rank),
                  and(eq(schema.taskLists.rank, after.rank), gt(schema.taskLists.id, after.id)),
                )
              : undefined,
          ),
        )
        .orderBy(asc(schema.taskLists.rank), asc(schema.taskLists.id))
        .limit(page.limit);
      return rows.map((row) => ({ list: row.list, effectiveFolderId: row.activeFolderId }));
    },

    async insertRegular(
      input: {
        id: string;
        userId: string;
        folderId: string | null;
        name: string;
        colorToken: string;
        rank: string;
        now: Date;
      },
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskList | null> {
      const [row] = await executor
        .insert(schema.taskLists)
        .values({
          id: input.id,
          userId: input.userId,
          folderId: input.folderId,
          name: input.name,
          colorToken: input.colorToken,
          rank: input.rank,
          kind: "regular",
          version: 1,
          createdAt: input.now,
          updatedAt: input.now,
          deletedAt: null,
        })
        .onConflictDoNothing({ target: [schema.taskLists.userId, schema.taskLists.id] })
        .returning();
      return row ?? null;
    },

    async updateRegular(
      input: {
        userId: string;
        id: string;
        expectedVersion: number;
        patch: { name?: string; colorToken?: string };
        now: Date;
      },
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskList | null> {
      const [row] = await executor
        .update(schema.taskLists)
        .set({
          ...input.patch,
          updatedAt: input.now,
          version: sql`${schema.taskLists.version} + 1`,
        })
        .where(
          and(
            eq(schema.taskLists.userId, input.userId),
            eq(schema.taskLists.id, input.id),
            eq(schema.taskLists.kind, "regular"),
            eq(schema.taskLists.version, input.expectedVersion),
            isNull(schema.taskLists.deletedAt),
          ),
        )
        .returning();
      return row ?? null;
    },

    async moveRegular(
      input: {
        userId: string;
        id: string;
        expectedVersion: number;
        folderId: string | null;
        rank: string;
        now: Date;
      },
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskList | null> {
      const [row] = await executor
        .update(schema.taskLists)
        .set({
          folderId: input.folderId,
          rank: input.rank,
          updatedAt: input.now,
          version: sql`${schema.taskLists.version} + 1`,
        })
        .where(
          and(
            eq(schema.taskLists.userId, input.userId),
            eq(schema.taskLists.id, input.id),
            eq(schema.taskLists.kind, "regular"),
            eq(schema.taskLists.version, input.expectedVersion),
            isNull(schema.taskLists.deletedAt),
          ),
        )
        .returning();
      return row ?? null;
    },

    async softDeleteRegular(
      input: { userId: string; id: string; expectedVersion: number; now: Date },
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskList | null> {
      const [row] = await executor
        .update(schema.taskLists)
        .set({
          deletedAt: input.now,
          updatedAt: input.now,
          version: sql`${schema.taskLists.version} + 1`,
        })
        .where(
          and(
            eq(schema.taskLists.userId, input.userId),
            eq(schema.taskLists.id, input.id),
            eq(schema.taskLists.kind, "regular"),
            eq(schema.taskLists.version, input.expectedVersion),
            isNull(schema.taskLists.deletedAt),
          ),
        )
        .returning();
      return row ?? null;
    },

    async restoreRegular(
      input: { userId: string; id: string; expectedVersion: number; now: Date },
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTaskList | null> {
      const [row] = await executor
        .update(schema.taskLists)
        .set({
          deletedAt: null,
          updatedAt: input.now,
          version: sql`${schema.taskLists.version} + 1`,
        })
        .where(
          and(
            eq(schema.taskLists.userId, input.userId),
            eq(schema.taskLists.id, input.id),
            eq(schema.taskLists.kind, "regular"),
            eq(schema.taskLists.version, input.expectedVersion),
            isNotNull(schema.taskLists.deletedAt),
          ),
        )
        .returning();
      return row ?? null;
    },
  };
}

async function findRegularList(
  userId: string,
  id: string,
  executor: DatabaseExecutor,
): Promise<StoredTaskList | null> {
  const [row] = await executor
    .select()
    .from(schema.taskLists)
    .where(
      and(
        eq(schema.taskLists.userId, userId),
        eq(schema.taskLists.id, id),
        eq(schema.taskLists.kind, "regular"),
        isNull(schema.taskLists.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}
