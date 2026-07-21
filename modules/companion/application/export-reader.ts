import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { DatabaseExecutor } from "@/shared/db/client";
import { ApplicationError } from "@/shared/http/application-error";

import { companionLevelSchema, companionSummarySchema } from "./contracts";
import { createCompanionExportRepository } from "../infrastructure/export-repository";

export async function readPortableCompanion(actor: AuthenticatedActor, executor: DatabaseExecutor) {
  const repository = createCompanionExportRepository(executor);
  const [profile, events, summaries, memories] = await Promise.all([
    repository.profile(actor.userId),
    repository.events(actor.userId),
    repository.summaries(actor.userId),
    repository.memories(actor.userId),
  ]);
  if (profile.length > 1 || summaries.length > 1)
    throw new ApplicationError("INTERNAL", "Companion export rows are invalid.");
  const current = profile[0] ?? null;
  return {
    profile: current
      ? {
          totalXp: current.totalXp,
          level: companionLevelSchema.parse(current.level),
          proactiveMessages: current.proactiveMessages,
          communicationStyle: current.communicationStyle,
          dailyMode: current.dailyMode,
          dailyModeDate: current.dailyModeDate,
          lastDailyPromptDate: current.lastDailyPromptDate,
          schemaVersion: current.schemaVersion,
          version: current.version,
          createdAt: current.createdAt.toISOString(),
          updatedAt: current.updatedAt.toISOString(),
        }
      : null,
    xpEvents: events.map((event) => ({
      id: event.id,
      actionType: event.actionType,
      sourceKey: event.sourceKey,
      xp: event.xp,
      localDate: event.localDate,
      createdAt: event.createdAt.toISOString(),
    })),
    summary: summaries[0]
      ? {
          schemaVersion: summaries[0].schemaVersion,
          summary: companionSummarySchema.parse(summaries[0].summary),
          windowStartedOn: summaries[0].windowStartedOn,
          windowEndedOn: summaries[0].windowEndedOn,
          generatedAt: summaries[0].generatedAt.toISOString(),
        }
      : null,
    memories: memories.map((memory) => ({
      id: memory.id,
      text: memory.text,
      createdAt: memory.createdAt.toISOString(),
    })),
  } as const;
}
