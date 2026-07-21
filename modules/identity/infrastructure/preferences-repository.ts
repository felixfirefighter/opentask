import { and, eq, sql } from "drizzle-orm";

import type { DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";
import type { Clock } from "@/shared/time/clock";

export type StoredPreferences = {
  schemaVersion: number;
  preferences: unknown;
  version: number;
};

export type PreferencesRepository = ReturnType<typeof createPreferencesRepository>;

export function createPreferencesRepository(clock: Clock) {
  return {
    async ensureDefaults(
      executor: DatabaseExecutor,
      userId: string,
      defaults: { schemaVersion: number; preferences: unknown },
    ): Promise<void> {
      const now = clock.now();
      await executor
        .insert(schema.userPreferences)
        .values({
          userId,
          schemaVersion: defaults.schemaVersion,
          preferences: defaults.preferences,
          version: 1,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: schema.userPreferences.userId });
    },

    async findByUserId(executor: DatabaseExecutor, userId: string): Promise<StoredPreferences | null> {
      const [row] = await executor
        .select()
        .from(schema.userPreferences)
        .where(eq(schema.userPreferences.userId, userId))
        .limit(1);

      return row
        ? { schemaVersion: row.schemaVersion, preferences: row.preferences, version: row.version }
        : null;
    },

    async update(
      executor: DatabaseExecutor,
      userId: string,
      expectedVersion: number,
      preferences: unknown,
      schemaVersion: number,
    ): Promise<StoredPreferences | null> {
      const [row] = await executor
        .update(schema.userPreferences)
        .set({
          preferences,
          schemaVersion,
          version: expectedVersion + 1,
          updatedAt: clock.now(),
        })
        .where(
          and(eq(schema.userPreferences.userId, userId), eq(schema.userPreferences.version, expectedVersion)),
        )
        .returning();

      return row
        ? { schemaVersion: row.schemaVersion, preferences: row.preferences, version: row.version }
        : null;
    },

    async resetToDefaults(
      executor: DatabaseExecutor,
      userId: string,
      defaults: { schemaVersion: number; preferences: unknown },
      resetAt: Date,
    ): Promise<StoredPreferences | null> {
      const [row] = await executor
        .update(schema.userPreferences)
        .set({
          preferences: defaults.preferences,
          schemaVersion: defaults.schemaVersion,
          version: sql`${schema.userPreferences.version} + 1`,
          updatedAt: resetAt,
        })
        .where(eq(schema.userPreferences.userId, userId))
        .returning();

      return row
        ? { schemaVersion: row.schemaVersion, preferences: row.preferences, version: row.version }
        : null;
    },
  };
}
