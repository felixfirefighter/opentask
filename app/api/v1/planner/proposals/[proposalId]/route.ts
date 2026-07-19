import { getAssistantPlannerApplication } from "@/modules/assistant";

import {
  assertNoTaskApiQuery,
  parseTaskApiId,
  privateTaskJson,
  resolveTaskApiActor,
  taskApiResponse,
} from "../../../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PlannerProposalContext = Readonly<{ params: Promise<{ proposalId: string }> }>;

export function GET(request: Request, context: PlannerProposalContext) {
  return taskApiResponse(async () => {
    const actor = await resolveTaskApiActor(request);
    assertNoTaskApiQuery(request);
    const proposalId = parseTaskApiId((await context.params).proposalId);
    return privateTaskJson(await getAssistantPlannerApplication().getProposal(actor, proposalId));
  });
}
