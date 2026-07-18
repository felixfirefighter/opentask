import { and, asc, eq, exists, gt, isNotNull, isNull, not, or, sql } from "drizzle-orm";

import { getDatabase, type DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

export type StoredSection = typeof schema.listSections.$inferSelect;

export function createSectionRepository(defaultExecutor: DatabaseExecutor = getDatabase()) {
  return {
    async findById(
      userId: string,
      listId: string,
      id: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredSection | null> {
      const [row] = await executor
        .select()
        .from(schema.listSections)
        .where(
          and(
            eq(schema.listSections.userId, userId),
            eq(schema.listSections.listId, listId),
            eq(schema.listSections.id, id),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async lockById(
      userId: string,
      listId: string,
      id: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredSection | null> {
      const [row] = await executor
        .select()
        .from(schema.listSections)
        .where(
          and(
            eq(schema.listSections.userId, userId),
            eq(schema.listSections.listId, listId),
            eq(schema.listSections.id, id),
          ),
        )
        .limit(1)
        .for("update");
      return row ?? null;
    },

    async list(
      userId: string,
      listId: string,
      page: { limit: number; after?: { rank: string; id: string } },
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredSection[]> {
      const after = page.after;
      return executor
        .select()
        .from(schema.listSections)
        .where(
          and(
            eq(schema.listSections.userId, userId),
            eq(schema.listSections.listId, listId),
            after
              ? or(
                  gt(schema.listSections.rank, after.rank),
                  and(eq(schema.listSections.rank, after.rank), gt(schema.listSections.id, after.id)),
                )
              : undefined,
          ),
        )
        .orderBy(asc(schema.listSections.rank), asc(schema.listSections.id))
        .limit(page.limit);
    },

    listRanks(userId: string, listId: string, executor: DatabaseExecutor = defaultExecutor) {
      return executor
        .select({ id: schema.listSections.id, rank: schema.listSections.rank })
        .from(schema.listSections)
        .where(and(eq(schema.listSections.userId, userId), eq(schema.listSections.listId, listId)))
        .orderBy(asc(schema.listSections.rank), asc(schema.listSections.id));
    },

    async insert(
      input: { id: string; userId: string; listId: string; name: string; rank: string; now: Date },
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredSection | null> {
      const [row] = await executor
        .insert(schema.listSections)
        .values({
          id: input.id,
          userId: input.userId,
          listId: input.listId,
          name: input.name,
          rank: input.rank,
          version: 1,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .onConflictDoNothing({ target: [schema.listSections.userId, schema.listSections.id] })
        .returning();
      return row ?? null;
    },

    async updateName(
      input: { userId: string; listId: string; id: string; expectedVersion: number; name: string; now: Date },
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredSection | null> {
      const [row] = await executor
        .update(schema.listSections)
        .set({
          name: input.name,
          updatedAt: input.now,
          version: sql`${schema.listSections.version} + 1`,
        })
        .where(
          and(
            eq(schema.listSections.userId, input.userId),
            eq(schema.listSections.listId, input.listId),
            eq(schema.listSections.id, input.id),
            eq(schema.listSections.version, input.expectedVersion),
          ),
        )
        .returning();
      return row ?? null;
    },

    async updateRank(
      input: { userId: string; listId: string; id: string; expectedVersion: number; rank: string; now: Date },
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredSection | null> {
      const [row] = await executor
        .update(schema.listSections)
        .set({
          rank: input.rank,
          updatedAt: input.now,
          version: sql`${schema.listSections.version} + 1`,
        })
        .where(
          and(
            eq(schema.listSections.userId, input.userId),
            eq(schema.listSections.listId, input.listId),
            eq(schema.listSections.id, input.id),
            eq(schema.listSections.version, input.expectedVersion),
          ),
        )
        .returning();
      return row ?? null;
    },

    async rewriteRanks(
      userId: string,
      listId: string,
      updates: readonly { id: string; rank: string }[],
      now: Date,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredSection[]> {
      const rows: StoredSection[] = [];
      for (const update of updates) {
        const [row] = await executor
          .update(schema.listSections)
          .set({
            rank: update.rank,
            updatedAt: now,
            version: sql`${schema.listSections.version} + 1`,
          })
          .where(
            and(
              eq(schema.listSections.userId, userId),
              eq(schema.listSections.listId, listId),
              eq(schema.listSections.id, update.id),
            ),
          )
          .returning();
        if (row) rows.push(row);
      }
      return rows;
    },

    async hasActiveTasks(
      userId: string,
      listId: string,
      sectionId: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<boolean> {
      const [row] = await executor
        .select({ found: sql<boolean>`true` })
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.userId, userId),
            eq(schema.tasks.listId, listId),
            eq(schema.tasks.sectionId, sectionId),
            isNull(schema.tasks.deletedAt),
          ),
        )
        .limit(1);
      return row !== undefined;
    },

    async clearDeletedTaskReferences(
      userId: string,
      listId: string,
      sectionId: string,
      now: Date,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<void> {
      await executor
        .update(schema.tasks)
        .set({
          sectionId: null,
          updatedAt: now,
          version: sql`${schema.tasks.version} + 1`,
        })
        .where(
          and(
            eq(schema.tasks.userId, userId),
            eq(schema.tasks.listId, listId),
            eq(schema.tasks.sectionId, sectionId),
            isNotNull(schema.tasks.deletedAt),
          ),
        );
    },

    async deleteEmpty(
      input: { userId: string; listId: string; id: string; expectedVersion: number },
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredSection | null> {
      const activeTask = executor
        .select({ one: sql<number>`1` })
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.userId, input.userId),
            eq(schema.tasks.listId, input.listId),
            eq(schema.tasks.sectionId, input.id),
            isNull(schema.tasks.deletedAt),
          ),
        );
      const [row] = await executor
        .delete(schema.listSections)
        .where(
          and(
            eq(schema.listSections.userId, input.userId),
            eq(schema.listSections.listId, input.listId),
            eq(schema.listSections.id, input.id),
            eq(schema.listSections.version, input.expectedVersion),
            not(exists(activeTask)),
          ),
        )
        .returning();
      return row ?? null;
    },
  };
}
