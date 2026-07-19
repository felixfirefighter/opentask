import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { DatabaseTransaction } from "@/shared/db/client";

import type {
  PlannerAction,
  PlannerProposalDto,
  PlannerSchedule,
  ProposalContextVersions,
} from "./proposal-contract";
import type { PlannerBusyScheduleQuery, PlannerSelectedTaskSnapshot } from "./proposal-creation-contract";

export type PlannerApplyTaskSnapshot = PlannerSelectedTaskSnapshot &
  Readonly<{ schedule: PlannerSchedule | null }>;

/** Runs proposal and task writes against one shared PostgreSQL transaction. */
export interface PlannerApplyTransactionRunner {
  execute<T>(work: (transaction: DatabaseTransaction) => Promise<T>): Promise<T>;
}

/** Assistant-owned row-lock and status transitions used only during explicit apply. */
export interface PlannerApplyProposalRepository {
  loadOwnedForUpdate(
    actor: AuthenticatedActor,
    proposalId: string,
    transaction: DatabaseTransaction,
  ): Promise<PlannerProposalDto | null>;
  markExpired(
    actor: AuthenticatedActor,
    proposalId: string,
    transaction: DatabaseTransaction,
  ): Promise<boolean>;
  markApplied(
    actor: AuthenticatedActor,
    proposalId: string,
    applyToken: string,
    appliedAt: Date,
    transaction: DatabaseTransaction,
  ): Promise<boolean>;
}

/**
 * Tasks-owned adapter. It rechecks active/open ownership and domain invariants;
 * a create action uses its actionId as the actor-scoped task ID and targets the
 * actor's immutable Inbox. Defer actions perform no task write.
 */
export interface PlannerApplyTaskWriter {
  loadOwnedOpenForUpdate(
    actor: AuthenticatedActor,
    taskIds: readonly string[],
    transaction: DatabaseTransaction,
  ): Promise<readonly PlannerApplyTaskSnapshot[]>;
  loadBusySchedulesForUpdate(
    actor: AuthenticatedActor,
    query: PlannerBusyScheduleQuery,
    excludedTaskIds: readonly string[],
    transaction: DatabaseTransaction,
  ): Promise<
    Readonly<{
      items: readonly Readonly<{ schedule: PlannerSchedule }>[];
      truncated: boolean;
    }>
  >;
  applyAllowedActions(
    actor: AuthenticatedActor,
    actions: readonly PlannerAction[],
    expectedVersions: ProposalContextVersions,
    transaction: DatabaseTransaction,
  ): Promise<void>;
}

export type PlannerApplyDependencies = Readonly<{
  transaction: PlannerApplyTransactionRunner;
  proposals: PlannerApplyProposalRepository;
  tasks: PlannerApplyTaskWriter;
}>;
