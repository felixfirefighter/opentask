import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { DatabaseExecutor } from "@/shared/db/client";
import { ApplicationError } from "@/shared/http/application-error";

import {
  plannerProposalSchema,
  plannerProposalStatusSchema,
  proposalContextVersionsSchema,
} from "./contracts";
import { createAssistantExportRepository } from "../infrastructure/export-repository";

export async function readPortablePlannerProposals(actor: AuthenticatedActor, executor: DatabaseExecutor) {
  const rows = await createAssistantExportRepository(executor).readOwned(actor.userId);
  return rows.map((row) => {
    if (row.userId !== actor.userId) {
      throw new ApplicationError("INTERNAL", "A planner proposal escaped its export owner scope.");
    }
    return {
      id: row.id,
      planningDate: row.planningDate,
      schemaVersion: row.schemaVersion,
      proposal: plannerProposalSchema.parse(row.proposal),
      contextVersions: proposalContextVersionsSchema.parse(row.contextVersions),
      status: plannerProposalStatusSchema.parse(row.status),
      model: row.model,
      promptVersion: row.promptVersion,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      appliedAt: row.appliedAt?.toISOString() ?? null,
    };
  });
}
