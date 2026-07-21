import { and, asc, eq, gt, isNotNull, isNull, ne, or, sql } from "drizzle-orm";

import { getDatabase, type DatabaseExecutor, type DatabaseTransaction } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

import { createTaskTagRepository, type StoredTag } from "./task-tag-repository";

export type { ReplaceTaskTagsResult, StoredTag, StoredTaskTag } from "./task-tag-repository";
export type TagPageCursor = Readonly<{ normalizedName: string; id: string }>;

export function createTagRepository(defaultExecutor: DatabaseExecutor = getDatabase()) {
  return {
    ...createTaskTagRepository(defaultExecutor),

    findActiveById(userId: string, id: string, executor: DatabaseExecutor = defaultExecutor) {
      return findTag(userId, id, executor);
    },

    async lockById(userId: string, id: string, transaction: DatabaseTransaction) {
      const [row] = await transaction
        .select()
        .from(schema.tags)
        .where(and(eq(schema.tags.userId, userId), eq(schema.tags.id, id)))
        .limit(1)
        .for("update");
      return row ?? null;
    },

    async resolveActivePageCursor(
      userId: string,
      id: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<TagPageCursor | null> {
      const normalizedName = sql<string>`lower(normalize(${schema.tags.name}, NFKC))`;
      const [row] = await executor
        .select({ normalizedName })
        .from(schema.tags)
        .where(and(eq(schema.tags.userId, userId), eq(schema.tags.id, id), isNull(schema.tags.deletedAt)))
        .limit(1);
      return row ? { normalizedName: row.normalizedName, id } : null;
    },

    async findActiveEquivalentName(
      userId: string,
      name: string,
      excludeId?: string,
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTag | null> {
      const [row] = await executor
        .select()
        .from(schema.tags)
        .where(
          and(
            eq(schema.tags.userId, userId),
            isNull(schema.tags.deletedAt),
            excludeId ? ne(schema.tags.id, excludeId) : undefined,
            sql`lower(normalize(${schema.tags.name}, NFKC)) = lower(normalize(${name}, NFKC))`,
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async lockNameMutations(userId: string, transaction: DatabaseTransaction): Promise<void> {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`omplish:tag-name:${userId}`}, 0))`,
      );
    },

    listActive(
      userId: string,
      page: { limit: number; after?: TagPageCursor },
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTag[]> {
      assertListLimit(page.limit);
      const normalizedName = sql<string>`lower(normalize(${schema.tags.name}, NFKC))`;
      const after = page.after;
      return executor
        .select()
        .from(schema.tags)
        .where(
          and(
            eq(schema.tags.userId, userId),
            isNull(schema.tags.deletedAt),
            after
              ? or(
                  gt(normalizedName, after.normalizedName),
                  and(eq(normalizedName, after.normalizedName), gt(schema.tags.id, after.id)),
                )
              : undefined,
          ),
        )
        .orderBy(asc(normalizedName), asc(schema.tags.id))
        .limit(page.limit);
    },

    async insert(
      input: {
        id: string;
        userId: string;
        name: string;
        colorToken: string;
        now: Date;
      },
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTag | null> {
      const [row] = await executor
        .insert(schema.tags)
        .values({
          id: input.id,
          userId: input.userId,
          name: input.name,
          colorToken: input.colorToken,
          version: 1,
          createdAt: input.now,
          updatedAt: input.now,
          deletedAt: null,
        })
        .onConflictDoNothing({ target: [schema.tags.userId, schema.tags.id] })
        .returning();
      return row ?? null;
    },

    async update(
      input: {
        userId: string;
        id: string;
        expectedVersion: number;
        patch: { name?: string; colorToken?: string };
        now: Date;
      },
      executor: DatabaseExecutor = defaultExecutor,
    ): Promise<StoredTag | null> {
      const [row] = await executor
        .update(schema.tags)
        .set({
          ...input.patch,
          updatedAt: input.now,
          version: sql`${schema.tags.version} + 1`,
        })
        .where(
          and(
            eq(schema.tags.userId, input.userId),
            eq(schema.tags.id, input.id),
            eq(schema.tags.version, input.expectedVersion),
            isNull(schema.tags.deletedAt),
          ),
        )
        .returning();
      return row ?? null;
    },

    softDelete(
      input: { userId: string; id: string; expectedVersion: number; now: Date },
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      return mutateDeletionState(input, executor, true);
    },

    restore(
      input: { userId: string; id: string; expectedVersion: number; now: Date },
      executor: DatabaseExecutor = defaultExecutor,
    ) {
      return mutateDeletionState(input, executor, false);
    },
  };
}

async function findTag(userId: string, id: string, executor: DatabaseExecutor): Promise<StoredTag | null> {
  const [row] = await executor
    .select()
    .from(schema.tags)
    .where(and(eq(schema.tags.userId, userId), eq(schema.tags.id, id), isNull(schema.tags.deletedAt)))
    .limit(1);
  return row ?? null;
}

async function mutateDeletionState(
  input: { userId: string; id: string; expectedVersion: number; now: Date },
  executor: DatabaseExecutor,
  deleting: boolean,
): Promise<StoredTag | null> {
  const [row] = await executor
    .update(schema.tags)
    .set({
      deletedAt: deleting ? input.now : null,
      updatedAt: input.now,
      version: sql`${schema.tags.version} + 1`,
    })
    .where(
      and(
        eq(schema.tags.userId, input.userId),
        eq(schema.tags.id, input.id),
        eq(schema.tags.version, input.expectedVersion),
        deleting ? isNull(schema.tags.deletedAt) : isNotNull(schema.tags.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

function assertListLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 101) {
    throw new RangeError("Tag repository page limit must be between 1 and 101.");
  }
}
