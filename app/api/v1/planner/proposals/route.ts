import { getAssistantPlannerApplication, plannerInputSchema } from "@/modules/assistant";

import {
  assertNoTaskApiQuery,
  privateTaskJson,
  readTaskApiMutation,
  taskApiResponse,
  taskMutationBodyLimits,
} from "../../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return taskApiResponse(request, "planner.generate-proposal", async () => {
    const { actor, input } = await readTaskApiMutation(request, plannerInputSchema, {
      maxBytes: taskMutationBodyLimits.task,
    });
    assertNoTaskApiQuery(request);
    const proposal = await getAssistantPlannerApplication().createProposal(actor, input);
    return privateTaskJson(proposal, {
      status: 201,
      headers: { location: `/api/v1/planner/proposals/${proposal.id}` },
    });
  });
}
