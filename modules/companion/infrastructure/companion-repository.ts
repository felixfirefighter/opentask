import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type { Database, DatabaseExecutor } from "@/shared/db/client";

import type { createCompanionSchema } from "./schema";

type CompanionSchema = ReturnType<typeof createCompanionSchema>;

export function createCompanionRepository(database: Database, tables: CompanionSchema) {
  const { companionProfiles, companionXpEvents, companionBehaviorSummaries, companionMemories } = tables;
  return {
    async ensureProfile(userId: string, executor: DatabaseExecutor = database) {
      await executor
        .insert(companionProfiles)
        .values({ userId })
        .onConflictDoNothing({ target: companionProfiles.userId });
      const [profile] = await executor
        .select()
        .from(companionProfiles)
        .where(eq(companionProfiles.userId, userId));
      if (!profile) throw new Error("Companion profile could not be prepared.");
      return profile;
    },
    insertAward(
      input: { userId: string; actionType: string; sourceKey: string; xp: number; localDate: string },
      executor: DatabaseExecutor,
    ) {
      return executor
        .insert(companionXpEvents)
        .values(input)
        .onConflictDoNothing()
        .returning({ xp: companionXpEvents.xp });
    },
    updateAwardedProfile(userId: string, xp: number, now: Date, executor: DatabaseExecutor) {
      return executor
        .update(companionProfiles)
        .set({
          totalXp: sql`${companionProfiles.totalXp} + ${xp}`,
          level: sql`case when ${companionProfiles.totalXp} + ${xp} >= 1000 then 3 when ${companionProfiles.totalXp} + ${xp} >= 300 then 2 else 1 end`,
          version: sql`${companionProfiles.version} + 1`,
          updatedAt: now,
        })
        .where(eq(companionProfiles.userId, userId))
        .returning();
    },
    getSummary(userId: string) {
      return database
        .select()
        .from(companionBehaviorSummaries)
        .where(eq(companionBehaviorSummaries.userId, userId))
        .then((rows) => rows[0] ?? null);
    },
    recentEvents(userId: string) {
      return database
        .select()
        .from(companionXpEvents)
        .where(eq(companionXpEvents.userId, userId))
        .orderBy(sql`${companionXpEvents.createdAt} desc`)
        .limit(3);
    },
    allEvents(userId: string) {
      return database
        .select({
          actionType: companionXpEvents.actionType,
          xp: companionXpEvents.xp,
          localDate: companionXpEvents.localDate,
        })
        .from(companionXpEvents)
        .where(eq(companionXpEvents.userId, userId));
    },
    updatePreferences(
      userId: string,
      version: number,
      patch: { proactiveMessages?: "enabled" | "muted"; communicationStyle?: "warm" | "focused" | "direct" },
      now: Date,
    ) {
      return database
        .update(companionProfiles)
        .set({ ...patch, version: sql`${companionProfiles.version} + 1`, updatedAt: now })
        .where(and(eq(companionProfiles.userId, userId), eq(companionProfiles.version, version)))
        .returning();
    },
    saveSummary(input: {
      userId: string;
      summary: object;
      windowStartedOn: string;
      windowEndedOn: string;
      generatedAt: Date;
    }) {
      return database
        .insert(companionBehaviorSummaries)
        .values({ ...input, schemaVersion: 1 })
        .onConflictDoUpdate({
          target: companionBehaviorSummaries.userId,
          set: {
            summary: input.summary,
            windowStartedOn: input.windowStartedOn,
            windowEndedOn: input.windowEndedOn,
            generatedAt: input.generatedAt,
          },
        });
    },
    listMemories(userId: string) {
      return database
        .select({
          id: companionMemories.id,
          text: companionMemories.text,
          createdAt: companionMemories.createdAt,
        })
        .from(companionMemories)
        .where(eq(companionMemories.userId, userId))
        .orderBy(asc(companionMemories.createdAt), asc(companionMemories.id));
    },
    saveMemory(userId: string, text: string, now: Date, executor: DatabaseExecutor = database) {
      return executor.insert(companionMemories).values({ userId, text, createdAt: now }).returning({
        id: companionMemories.id,
        text: companionMemories.text,
        createdAt: companionMemories.createdAt,
      });
    },
    deleteMemories(userId: string, ids: readonly string[], executor: DatabaseExecutor = database) {
      if (ids.length === 0) return Promise.resolve();
      return executor
        .delete(companionMemories)
        .where(and(eq(companionMemories.userId, userId), inArray(companionMemories.id, [...ids])));
    },
    deleteMemory(userId: string, id: string) {
      return database
        .delete(companionMemories)
        .where(and(eq(companionMemories.userId, userId), eq(companionMemories.id, id)))
        .returning({ id: companionMemories.id });
    },
    setDailyMode(userId: string, mode: "warm" | "focused" | "direct", localDate: string, now: Date) {
      return database
        .update(companionProfiles)
        .set({ dailyMode: mode, dailyModeDate: localDate, updatedAt: now })
        .where(eq(companionProfiles.userId, userId))
        .returning();
    },
    async deleteData(userId: string) {
      await database.transaction(async (transaction) => {
        await transaction.delete(companionMemories).where(eq(companionMemories.userId, userId));
        await transaction
          .delete(companionBehaviorSummaries)
          .where(eq(companionBehaviorSummaries.userId, userId));
        await transaction.delete(companionXpEvents).where(eq(companionXpEvents.userId, userId));
        await transaction.delete(companionProfiles).where(eq(companionProfiles.userId, userId));
      });
    },
  } as const;
}
