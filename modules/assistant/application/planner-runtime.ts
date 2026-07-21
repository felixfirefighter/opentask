import { createPlanningBusyIntervalReader } from "@/modules/planning";
import { getTasksApplication, type TasksApplication } from "@/modules/tasks";
import { getDatabase } from "@/shared/db/client";
import { plannerProposals } from "@/shared/db/schema";

import { createPlannerProposalRepository } from "../infrastructure/planner-proposal-repository";
import { createPlannerProposalApplier } from "./apply-planner-proposal";
import { createPlannerProposalCreator } from "./create-planner-proposal";
import { createPlannerApplyProposalAdapter } from "./planner-apply-proposal-adapter";
import { createPlannerApplyTaskAdapter } from "./planner-apply-task-adapter";
import { getPlannerCapability } from "./planner-capability";
import { createPlannerExtractionProvider } from "./planner-extraction-provider";
import { createPlannerProposalLifecycle } from "./proposal-lifecycle";

let application: ReturnType<typeof createProductionAssistantPlannerApplication> | undefined;

export function getAssistantPlannerApplication() {
  application ??= createProductionAssistantPlannerApplication({ tasks: getTasksApplication() });
  return application;
}

export function createProductionAssistantPlannerApplication({
  tasks,
}: Readonly<{ tasks: PlannerTasksApplication }>) {
  const database = getDatabase();
  const repository = createPlannerProposalRepository(plannerProposals, database);
  const proposals = createPlannerProposalLifecycle({ persistence: repository });
  const creator = createPlannerProposalCreator({
    provider: createPlannerExtractionProvider(),
    selectedTasks: tasks.taskSnapshots,
    busyIntervals: createPlanningBusyIntervalReader(tasks.occurrences),
    proposals,
  });
  const applier = createPlannerProposalApplier({
    transaction: { execute: (work) => database.transaction(work) },
    proposals: createPlannerApplyProposalAdapter(repository),
    tasks: createPlannerApplyTaskAdapter(tasks.reviewedPlanWrites),
  });

  return {
    capability: getPlannerCapability,
    createProposal: creator.create,
    getProposal: proposals.get,
    rejectProposal: proposals.reject,
    applyProposal: applier.apply,
  } as const;
}

type PlannerTasksApplication = Pick<TasksApplication, "occurrences" | "reviewedPlanWrites" | "taskSnapshots">;
