import type { AuthenticatedActor } from "@/shared/auth/actor";
import { ApplicationError } from "@/shared/http/application-error";
import { systemClock, type Clock } from "@/shared/time/clock";

import {
  plannerApplyResultSchema,
  plannerProposalDtoSchema,
  plannerSelectionSchema,
  type PlannerAction,
  type PlannerApplyResult,
  type PlannerSelection,
  type ProposalContextVersions,
} from "./contracts";
import { entityIdSchema } from "./contracts/contract-primitives";
import type { PlannerApplyDependencies } from "./contracts/planner-apply-unit-of-work";
import {
  defaultPlannerApplyScheduler,
  preparePlannerApplyScheduleValidation,
  validatePlannerApplySchedules,
} from "./planner-apply-schedule-validation";
import {
  taskIdsForActions,
  validateCurrentPlannerTasks,
  validatePlannerSelection,
} from "./planner-selection-validation";

type DeterministicScheduler = typeof defaultPlannerApplyScheduler;

type ApplyTransactionOutcome =
  | Readonly<{ kind: "result"; result: PlannerApplyResult }>
  | Readonly<{ kind: "expired" }>
  | Readonly<{ kind: "transition_conflict" }>;

export type PlannerProposalApplier = ReturnType<typeof createPlannerProposalApplier>;

export function createPlannerProposalApplier(
  dependencies: PlannerApplyDependencies,
  options: Readonly<{ clock?: Clock; schedule?: DeterministicScheduler }> = {},
) {
  const clock = options.clock ?? systemClock;
  const schedule = options.schedule ?? defaultPlannerApplyScheduler;

  return {
    async apply(
      actor: AuthenticatedActor,
      rawProposalId: string,
      rawSelection: PlannerSelection,
    ): Promise<PlannerApplyResult> {
      const proposalId = entityIdSchema.parse(rawProposalId);
      const selection = plannerSelectionSchema.parse(rawSelection);
      if (selection.proposalId !== proposalId) {
        throw new ApplicationError(
          "VALIDATION_FAILED",
          "The planner selection does not match the requested proposal.",
        );
      }

      const outcome = await dependencies.transaction.execute<ApplyTransactionOutcome>(async (transaction) => {
        const stored = await dependencies.proposals.loadOwnedForUpdate(actor, proposalId, transaction);
        if (!stored) {
          throw new ApplicationError("NOT_FOUND", "The requested planner proposal was not found.");
        }
        const parsed = plannerProposalDtoSchema.safeParse(stored);
        if (!parsed.success || parsed.data.id !== proposalId) {
          throw new ApplicationError("INTERNAL", "The planner proposal could not be read safely.");
        }
        const proposal = parsed.data;
        if (selection.applyToken !== proposal.applyToken) {
          throw new ApplicationError("CONFLICT", "The planner apply token does not match this proposal.");
        }

        if (proposal.status === "applied") {
          validatePlannerSelection(proposal, selection);
          return {
            kind: "result",
            result: plannerApplyResultSchema.parse({
              proposalId,
              outcome: "already_applied",
              appliedActionCount: 0,
            }),
          };
        }
        if (proposal.status !== "pending") {
          return { kind: "transition_conflict" };
        }

        const now = clock.now();
        if (Date.parse(proposal.expiresAt) <= now.getTime()) {
          const expired = await dependencies.proposals.markExpired(actor, proposalId, transaction);
          return expired ? { kind: "expired" } : { kind: "transition_conflict" };
        }

        validatePlannerSelection(proposal, selection);
        const selectedTaskIds = taskIdsForActions(selection.actions);
        const writableActions = selection.actions.filter(
          (action): action is Exclude<PlannerAction, { kind: "defer" }> => action.kind !== "defer",
        );
        const scheduleValidation = preparePlannerApplyScheduleValidation(proposal, writableActions);
        const current = await dependencies.tasks.loadApplyContextForUpdate(
          actor,
          selectedTaskIds,
          scheduleValidation?.busyRequest ?? null,
          transaction,
        );
        validateCurrentPlannerTasks(proposal, selection.actions, current.tasks);
        validatePlannerApplySchedules({
          proposal,
          prepared: scheduleValidation,
          busyIntervals: current.busyIntervals,
          schedule,
        });

        if (writableActions.length > 0) {
          await dependencies.tasks.applyAllowedActions(
            actor,
            writableActions,
            selectedContextVersions(proposal.contextVersions, writableActions),
            transaction,
          );
        }

        const marked = await dependencies.proposals.markApplied(
          actor,
          proposalId,
          proposal.applyToken,
          now,
          transaction,
        );
        if (!marked) {
          throw new ApplicationError(
            "CONFLICT",
            "The planner proposal changed before the apply transaction completed.",
          );
        }

        return {
          kind: "result",
          result: plannerApplyResultSchema.parse({
            proposalId,
            outcome: "applied",
            appliedActionCount: writableActions.length,
          }),
        };
      });

      if (outcome.kind === "expired") {
        throw new ApplicationError("CONFLICT", "The planner proposal expired before it was applied.");
      }
      if (outcome.kind === "transition_conflict") {
        throw new ApplicationError("CONFLICT", "Only a pending planner proposal can be applied.");
      }
      return outcome.result;
    },
  } as const;
}

function selectedContextVersions(
  contextVersions: ProposalContextVersions,
  actions: readonly PlannerAction[],
): ProposalContextVersions {
  const taskIds = taskIdsForActions(actions);
  return Object.fromEntries(
    taskIds.map((taskId) => {
      const version = contextVersions[taskId];
      if (version === undefined) {
        throw new ApplicationError("INTERNAL", "The planner proposal is missing a task version.");
      }
      return [taskId, version];
    }),
  );
}
