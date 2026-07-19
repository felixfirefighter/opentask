import type { Database, DatabaseExecutor } from "@/shared/db/client";
import { plannerProposals } from "@/shared/db/schema";

import { entityIdSchema } from "./contracts/contract-primitives";
import { createPlannerProposalRepository } from "../infrastructure/planner-proposal-repository";

export function createDemoProposalResetter({ database }: { database: Database }) {
  const repository = createPlannerProposalRepository(plannerProposals, database);

  return {
    reset(rawUserId: string, executor: DatabaseExecutor = database): Promise<number> {
      return repository.deleteOwned(entityIdSchema.parse(rawUserId), executor);
    },
  };
}
