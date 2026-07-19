import type { PlannerProposal, PlannerProposalStatus, ProposalContextVersions } from "./proposal-contract";

export type NewPlannerProposalRecord = Readonly<{
  id: string;
  userId: string;
  planningDate: string;
  schemaVersion: number;
  proposal: PlannerProposal;
  contextVersions: ProposalContextVersions;
  status: "pending";
  model: string;
  promptVersion: string;
  idempotencyKey: string;
  createdAt: Date;
  expiresAt: Date;
  appliedAt: null;
}>;

export type StoredPlannerProposalRecord = Readonly<{
  id: string;
  userId: string;
  planningDate: string;
  schemaVersion: number;
  proposal: unknown;
  contextVersions: unknown;
  status: string;
  model: string;
  promptVersion: string;
  idempotencyKey: string;
  createdAt: Date;
  expiresAt: Date;
  appliedAt: Date | null;
}>;

export type PlannerProposalPersistence = Readonly<{
  insert(record: NewPlannerProposalRecord): Promise<StoredPlannerProposalRecord>;
  findOwned(userId: string, id: string): Promise<StoredPlannerProposalRecord | null>;
  transitionOwned(
    userId: string,
    id: string,
    expectedStatus: PlannerProposalStatus,
    nextStatus: PlannerProposalStatus,
    appliedAt: Date | null,
  ): Promise<StoredPlannerProposalRecord | null>;
  expireOwned(userId: string, now: Date): Promise<number>;
}>;
