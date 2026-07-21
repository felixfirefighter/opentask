import { asc, eq } from "drizzle-orm";

import type { DatabaseExecutor } from "@/shared/db/client";
import {
  companionBehaviorSummaries,
  companionMemories,
  companionProfiles,
  companionXpEvents,
} from "@/shared/db/schema";

export function createCompanionExportRepository(executor: DatabaseExecutor) {
  return {
    profile(userId: string) {
      return executor.select().from(companionProfiles).where(eq(companionProfiles.userId, userId));
    },
    events(userId: string) {
      return executor
        .select()
        .from(companionXpEvents)
        .where(eq(companionXpEvents.userId, userId))
        .orderBy(asc(companionXpEvents.createdAt), asc(companionXpEvents.id));
    },
    summaries(userId: string) {
      return executor
        .select()
        .from(companionBehaviorSummaries)
        .where(eq(companionBehaviorSummaries.userId, userId));
    },
    memories(userId: string) {
      return executor
        .select()
        .from(companionMemories)
        .where(eq(companionMemories.userId, userId))
        .orderBy(asc(companionMemories.createdAt), asc(companionMemories.id));
    },
  } as const;
}
