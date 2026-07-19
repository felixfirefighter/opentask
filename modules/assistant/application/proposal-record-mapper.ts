import { ApplicationError } from "@/shared/http/application-error";

import {
  plannerProposalDtoSchema,
  plannerProposalSchema,
  plannerProposalStatusSchema,
  proposalContextVersionsSchema,
  type PlannerProposal,
  type PlannerProposalDto,
  type ProposalContextVersions,
} from "./contracts/proposal-contract";
import type { StoredPlannerProposalRecord } from "./contracts/proposal-persistence-contract";

export function mapStoredPlannerProposalRecord(
  record: StoredPlannerProposalRecord,
  expectedUserId: string,
): PlannerProposalDto {
  try {
    const proposal = plannerProposalSchema.parse(record.proposal);
    const contextVersions = proposalContextVersionsSchema.parse(record.contextVersions);
    const status = plannerProposalStatusSchema.parse(record.status);
    if (
      proposal.schemaVersion !== record.schemaVersion ||
      proposal.planningDate !== record.planningDate ||
      record.userId !== expectedUserId ||
      record.expiresAt.getTime() <= record.createdAt.getTime() ||
      (status === "applied") !== (record.appliedAt !== null)
    ) {
      throw new Error("Stored proposal metadata is inconsistent.");
    }
    assertPlannerSubjectContextVersions(proposal, contextVersions);

    return plannerProposalDtoSchema.parse({
      id: record.id,
      planningDate: record.planningDate,
      schemaVersion: record.schemaVersion,
      proposal,
      contextVersions,
      status,
      model: record.model,
      promptVersion: record.promptVersion,
      applyToken: record.idempotencyKey,
      createdAt: record.createdAt.toISOString(),
      expiresAt: record.expiresAt.toISOString(),
      appliedAt: record.appliedAt?.toISOString() ?? null,
    });
  } catch {
    throw new ApplicationError("INTERNAL", "The planner proposal could not be read safely.");
  }
}

export function assertPlannerSubjectContextVersions(
  proposal: PlannerProposal,
  contextVersions: ProposalContextVersions,
): void {
  for (const subject of proposal.subjects) {
    if (subject.taskId === null) continue;
    if (!(subject.taskId in contextVersions)) {
      throw new ApplicationError("VALIDATION_FAILED", "A planner subject is missing its task version.");
    }
  }
}
