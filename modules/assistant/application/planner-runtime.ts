import type { AuthenticatedActor } from "@/shared/auth/actor";
import { getTasksApplication } from "@/modules/tasks";
import { getDatabase } from "@/shared/db/client";
import { plannerProposals } from "@/shared/db/schema";

import { createPlannerProposalRepository } from "../infrastructure/planner-proposal-repository";
import { createPlannerProposalApplier } from "./apply-planner-proposal";
import { createPlannerProposalCreator } from "./create-planner-proposal";
import { createPlannerApplyProposalAdapter } from "./planner-apply-proposal-adapter";
import { createPlannerApplyTaskAdapter } from "./planner-apply-task-adapter";
import { getPlannerCapability, getPlannerCapabilityForActor } from "./planner-capability";
import { createPlannerExtractionProvider } from "./planner-extraction-provider";
import { createPlannerProposalLifecycle } from "./proposal-lifecycle";
import { getOpenAIKeyForActor } from "../infrastructure/openai-credential-config";
import type { PlannerBusyScheduleReader, PlannerInput } from "./contracts";

let application: ReturnType<typeof createAssistantPlannerApplication> | undefined;

export function getAssistantPlannerApplication() {
  application ??= createAssistantPlannerApplication();
  return application;
}

function createAssistantPlannerApplication() {
  const database = getDatabase();
  const tasks = getTasksApplication();
  const repository = createPlannerProposalRepository(plannerProposals, database);
  const proposals = createPlannerProposalLifecycle({ persistence: repository });
  const busySchedules: PlannerBusyScheduleReader = {
    async listRange(actor, query) {
      const page = await tasks.schedules.listRange(actor, query);
      return {
        items: page.items.map(({ schedule }) => ({
          schedule:
            schedule.kind === "all_day"
              ? { kind: schedule.kind }
              : { kind: schedule.kind, startAt: schedule.startAt, endAt: schedule.endAt },
        })),
        truncated: page.truncated,
      };
    },
  };
  const creatorDependencies = {
    selectedTasks: tasks.taskSnapshots,
    busySchedules,
    proposals,
  };
  const applier = createPlannerProposalApplier({
    transaction: { execute: (work) => database.transaction(work) },
    proposals: createPlannerApplyProposalAdapter(repository),
    tasks: createPlannerApplyTaskAdapter(tasks.reviewedPlanWrites),
  });

  return {
    capability(actor?: AuthenticatedActor) {
      return actor ? getPlannerCapabilityForActor(actor) : getPlannerCapability();
    },
    async createProposal(actor: AuthenticatedActor, input: PlannerInput) {
      const creator = createPlannerProposalCreator({
        ...creatorDependencies,
        provider: createPlannerExtractionProvider(await getOpenAIKeyForActor(database, actor.userId)),
      });
      return creator.create(actor, input);
    },
    getProposal: proposals.get,
    rejectProposal: proposals.reject,
    applyProposal: applier.apply,
  } as const;
}
