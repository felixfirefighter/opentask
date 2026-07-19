import { z } from "zod";

import { getAssistantPlannerApplication } from "@/modules/assistant";

import {
  assertNoTaskApiQuery,
  parseTaskApiId,
  privateTaskJson,
  readTaskApiMutation,
  taskApiResponse,
} from "../../../../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PlannerProposalContext = Readonly<{ params: Promise<{ proposalId: string }> }>;

export function POST(request: Request, context: PlannerProposalContext) {
  return taskApiResponse(request, "planner.reject-proposal", async () => {
    const { actor } = await readTaskApiMutation(request, z.strictObject({}));
    assertNoTaskApiQuery(request);
    const proposalId = parseTaskApiId((await context.params).proposalId);
    return privateTaskJson(await getAssistantPlannerApplication().rejectProposal(actor, proposalId));
  });
}
