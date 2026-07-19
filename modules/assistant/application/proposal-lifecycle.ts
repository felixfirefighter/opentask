import { ApplicationError } from "@/shared/http/application-error";
import type { AuthenticatedActor } from "@/shared/auth/actor";
import { createEntityId } from "@/shared/db/ids";
import { systemClock, type Clock } from "@/shared/time/clock";

import { PLANNER_SCHEMA_VERSION, entityIdSchema } from "./contracts/contract-primitives";
import type {
  NewPlannerProposalRecord,
  PlannerProposalPersistence,
  StoredPlannerProposalRecord,
} from "./contracts/proposal-persistence-contract";
import {
  plannerProposalDtoSchema,
  plannerProposalSchema,
  plannerProposalStatusSchema,
  proposalContextVersionsSchema,
  type PlannerProposal,
  type PlannerProposalDto,
  type ProposalContextVersions,
} from "./contracts/proposal-contract";

const DEFAULT_PROPOSAL_TTL_MS = 30 * 60 * 1_000;

export type PersistPlannerProposalInput = Readonly<{
  proposal: PlannerProposal;
  contextVersions: ProposalContextVersions;
  model: string;
  promptVersion: string;
}>;

export type PlannerProposalLifecycle = ReturnType<typeof createPlannerProposalLifecycle>;

export function createPlannerProposalLifecycle(dependencies: {
  persistence: PlannerProposalPersistence;
  clock?: Clock;
  createId?: () => string;
  proposalTtlMs?: number;
}) {
  const clock = dependencies.clock ?? systemClock;
  const createId = dependencies.createId ?? createEntityId;
  const proposalTtlMs = dependencies.proposalTtlMs ?? DEFAULT_PROPOSAL_TTL_MS;
  assertProposalTtl(proposalTtlMs);

  const get = async (actor: AuthenticatedActor, proposalId: string): Promise<PlannerProposalDto> => {
    const id = entityIdSchema.parse(proposalId);
    const record = await findOwnedOrThrow(dependencies.persistence, actor.userId, id);
    return expireIfDue(dependencies.persistence, actor.userId, toDto(record, actor.userId), clock.now());
  };

  return {
    async persist(
      actor: AuthenticatedActor,
      input: PersistPlannerProposalInput,
    ): Promise<PlannerProposalDto> {
      const proposal = plannerProposalSchema.parse(input.proposal);
      const contextVersions = proposalContextVersionsSchema.parse(input.contextVersions);
      assertSubjectContextVersions(proposal, contextVersions);

      const createdAt = clock.now();
      const expiresAt = new Date(createdAt.getTime() + proposalTtlMs);
      const id = entityIdSchema.parse(createId());
      const applyToken = entityIdSchema.parse(createId());
      const dto = plannerProposalDtoSchema.parse({
        id,
        planningDate: proposal.planningDate,
        schemaVersion: PLANNER_SCHEMA_VERSION,
        proposal,
        contextVersions,
        status: "pending",
        model: input.model,
        promptVersion: input.promptVersion,
        applyToken,
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        appliedAt: null,
      });

      const record: NewPlannerProposalRecord = {
        id: dto.id,
        userId: actor.userId,
        planningDate: dto.planningDate,
        schemaVersion: dto.schemaVersion,
        proposal: dto.proposal,
        contextVersions: dto.contextVersions,
        status: "pending",
        model: dto.model,
        promptVersion: dto.promptVersion,
        idempotencyKey: dto.applyToken,
        createdAt,
        expiresAt,
        appliedAt: null,
      };
      return toDto(await dependencies.persistence.insert(record), actor.userId);
    },

    get,

    async reject(actor: AuthenticatedActor, proposalId: string): Promise<PlannerProposalDto> {
      const current = await get(actor, proposalId);
      if (current.status !== "pending") {
        throw proposalConflict("Only a pending planner proposal can be rejected.");
      }

      const transitioned = await dependencies.persistence.transitionOwned(
        actor.userId,
        current.id,
        "pending",
        "rejected",
        null,
      );
      if (transitioned) return toDto(transitioned, actor.userId);

      const latest = await findOwnedOrThrow(dependencies.persistence, actor.userId, current.id);
      const latestDto = toDto(latest, actor.userId);
      if (latestDto.status === "rejected") return latestDto;
      throw proposalConflict("The planner proposal changed before it could be rejected.");
    },

    expireOwned(actor: AuthenticatedActor): Promise<number> {
      return dependencies.persistence.expireOwned(actor.userId, clock.now());
    },
  };
}

async function expireIfDue(
  persistence: PlannerProposalPersistence,
  userId: string,
  proposal: PlannerProposalDto,
  now: Date,
): Promise<PlannerProposalDto> {
  if (proposal.status !== "pending" || Date.parse(proposal.expiresAt) > now.getTime()) return proposal;

  const expired = await persistence.transitionOwned(userId, proposal.id, "pending", "expired", null);
  if (expired) return toDto(expired, userId);

  return toDto(await findOwnedOrThrow(persistence, userId, proposal.id), userId);
}

async function findOwnedOrThrow(
  persistence: PlannerProposalPersistence,
  userId: string,
  id: string,
): Promise<StoredPlannerProposalRecord> {
  const record = await persistence.findOwned(userId, id);
  if (!record || record.userId !== userId) {
    throw new ApplicationError("NOT_FOUND", "The requested planner proposal was not found.");
  }
  return record;
}

function toDto(record: StoredPlannerProposalRecord, expectedUserId: string): PlannerProposalDto {
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
    assertSubjectContextVersions(proposal, contextVersions);

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

function assertSubjectContextVersions(
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

function assertProposalTtl(value: number): void {
  if (!Number.isSafeInteger(value) || value < 60_000 || value > 24 * 60 * 60 * 1_000) {
    throw new RangeError("Planner proposal TTL must be between one minute and 24 hours.");
  }
}

function proposalConflict(message: string): ApplicationError {
  return new ApplicationError("CONFLICT", message);
}
