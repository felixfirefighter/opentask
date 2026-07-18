import { and, asc, eq, gt, isNotNull, isNull, or, sql } from "drizzle-orm";

import { getDatabase, type DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

export type StoredFolder = typeof schema.listFolders.$inferSelect;

export function createFolderRepository(defaultExecutor: DatabaseExecutor = getDatabase()) {
  return {
    findById(userId: string, id: string, executor: DatabaseExecutor = defaultExecutor) {
      return findFolder(userId, id, executor);
    },

    async lockById(userId: string, id: string, executor: DatabaseExecutor = defaultExecutor) {
      const [row] = await executor
        .select()
        .from(schema.listFolders)
        .where(and(eq(schema.listFolders.userId, userId), eq(schema.listFolders.id, id)))
        .limit(1)
        .for("update");
      return row ?? null;
    },

    async listActive(
      userId: string,
      page: { limit: number; after?: { rank: string; id: string } },
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      const after = page.after;
      return executor
        .select()
        .from(schema.listFolders)
        .where(
          and(
            eq(schema.listFolders.userId, userId),
            isNull(schema.listFolders.deletedAt),
            after
              ? or(
                  gt(schema.listFolders.rank, after.rank),
                  and(eq(schema.listFolders.rank, after.rank), gt(schema.listFolders.id, after.id)),
                )
              : undefined,
          ),
        )
        .orderBy(asc(schema.listFolders.rank), asc(schema.listFolders.id))
        .limit(page.limit);
    },

    listActiveRanks(userId: string, executor: DatabaseExecutor = defaultExecutor) {
      return executor
        .select({ id: schema.listFolders.id, rank: schema.listFolders.rank })
        .from(schema.listFolders)
        .where(and(eq(schema.listFolders.userId, userId), isNull(schema.listFolders.deletedAt)))
        .orderBy(asc(schema.listFolders.rank), asc(schema.listFolders.id));
    },

    async insert(
      input: {
        id: string;
        userId: string;
        name: string;
        rank: string;
        now: Date;
      },
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      const [row] = await executor
        .insert(schema.listFolders)
        .values({
          id: input.id,
          userId: input.userId,
          name: input.name,
          rank: input.rank,
          version: 1,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .onConflictDoNothing({ target: [schema.listFolders.userId, schema.listFolders.id] })
        .returning();
      return row ?? null;
    },

    async updateName(
      input: { userId: string; id: string; expectedVersion: number; name: string; now: Date },
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      const [row] = await executor
        .update(schema.listFolders)
        .set({
          name: input.name,
          updatedAt: input.now,
          version: sql`${schema.listFolders.version} + 1`,
        })
        .where(
          and(
            eq(schema.listFolders.userId, input.userId),
            eq(schema.listFolders.id, input.id),
            eq(schema.listFolders.version, input.expectedVersion),
            isNull(schema.listFolders.deletedAt),
          ),
        )
        .returning();
      return row ?? null;
    },

    async updateRank(
      input: { userId: string; id: string; expectedVersion: number; rank: string; now: Date },
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      const [row] = await executor
        .update(schema.listFolders)
        .set({
          rank: input.rank,
          updatedAt: input.now,
          version: sql`${schema.listFolders.version} + 1`,
        })
        .where(
          and(
            eq(schema.listFolders.userId, input.userId),
            eq(schema.listFolders.id, input.id),
            eq(schema.listFolders.version, input.expectedVersion),
            isNull(schema.listFolders.deletedAt),
          ),
        )
        .returning();
      return row ?? null;
    },

    async rewriteRanks(
      userId: string,
      updates: readonly { id: string; rank: string }[],
      now: Date,
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      const rows: StoredFolder[] = [];
      for (const update of updates) {
        const [row] = await executor
          .update(schema.listFolders)
          .set({
            rank: update.rank,
            updatedAt: now,
            version: sql`${schema.listFolders.version} + 1`,
          })
          .where(
            and(
              eq(schema.listFolders.userId, userId),
              eq(schema.listFolders.id, update.id),
              isNull(schema.listFolders.deletedAt),
            ),
          )
          .returning();
        if (row) rows.push(row);
      }
      return rows;
    },

    async softDelete(
      input: { userId: string; id: string; expectedVersion: number; now: Date },
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      const [row] = await executor
        .update(schema.listFolders)
        .set({
          deletedAt: input.now,
          updatedAt: input.now,
          version: sql`${schema.listFolders.version} + 1`,
        })
        .where(
          and(
            eq(schema.listFolders.userId, input.userId),
            eq(schema.listFolders.id, input.id),
            eq(schema.listFolders.version, input.expectedVersion),
            isNull(schema.listFolders.deletedAt),
          ),
        )
        .returning();
      return row ?? null;
    },

    async restore(
      input: { userId: string; id: string; expectedVersion: number; now: Date },
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      const [row] = await executor
        .update(schema.listFolders)
        .set({
          deletedAt: null,
          updatedAt: input.now,
          version: sql`${schema.listFolders.version} + 1`,
        })
        .where(
          and(
            eq(schema.listFolders.userId, input.userId),
            eq(schema.listFolders.id, input.id),
            eq(schema.listFolders.version, input.expectedVersion),
            isNotNull(schema.listFolders.deletedAt),
          ),
        )
        .returning();
      return row ?? null;
    },
  };
}

async function findFolder(
  userId: string,
  id: string,
  executor: DatabaseExecutor,
): Promise<StoredFolder | null> {
  const [row] = await executor
    .select()
    .from(schema.listFolders)
    .where(
      and(
        eq(schema.listFolders.userId, userId),
        eq(schema.listFolders.id, id),
        isNull(schema.listFolders.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}
