import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { DatabaseExecutor } from "@/shared/db/client";

import { createFocusPortabilityRepository } from "../infrastructure/focus-portability-repository";

export async function readPortableFocus(actor: AuthenticatedActor, executor: DatabaseExecutor) {
  const rows = await createFocusPortabilityRepository(executor).readOwned(actor.userId);
  return {
    sessions: rows.map((row) => {
      if (row.endedAt === null || row.state !== "completed" || row.kind !== "focus") {
        throw new Error("The portable Focus reader returned an ineligible session.");
      }
      return {
        id: row.id,
        taskId: row.taskId,
        habitId: row.habitId,
        mode: row.mode,
        accumulatedActiveSeconds: row.accumulatedActiveSeconds,
        plannedSeconds: row.plannedSeconds,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt.toISOString(),
        version: row.version,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    }),
  } as const;
}
