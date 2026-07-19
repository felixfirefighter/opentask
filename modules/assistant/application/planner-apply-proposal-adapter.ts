import type { createPlannerProposalRepository } from "../infrastructure/planner-proposal-repository";
import type { PlannerApplyProposalRepository } from "./contracts";
import { mapStoredPlannerProposalRecord } from "./proposal-record-mapper";

export function createPlannerApplyProposalAdapter(
  repository: ReturnType<typeof createPlannerProposalRepository>,
): PlannerApplyProposalRepository {
  return {
    async loadOwnedForUpdate(actor, proposalId, transaction) {
      const record = await repository.findOwnedForUpdate(actor.userId, proposalId, transaction);
      return record ? mapStoredPlannerProposalRecord(record, actor.userId) : null;
    },

    async markExpired(actor, proposalId, transaction) {
      return Boolean(
        await repository.transitionOwned(actor.userId, proposalId, "pending", "expired", null, transaction),
      );
    },

    markApplied(actor, proposalId, applyToken, appliedAt, transaction) {
      return repository.markAppliedOwned(actor.userId, proposalId, applyToken, appliedAt, transaction);
    },
  };
}
