import { getAssistantPlannerApplication, plannerSelectionSchema } from "@/modules/assistant";
import { ApplicationError } from "@/shared/http/application-error";

import {
  assertNoTaskApiQuery,
  parseTaskApiCreateId,
  parseTaskApiId,
  privateTaskJson,
  readTaskApiMutation,
  taskApiResponse,
  taskMutationBodyLimits,
} from "../../../../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PlannerProposalContext = Readonly<{ params: Promise<{ proposalId: string }> }>;

export function POST(request: Request, context: PlannerProposalContext) {
  return taskApiResponse(async () => {
    const { actor, input } = await readTaskApiMutation(request, plannerSelectionSchema, {
      maxBytes: taskMutationBodyLimits.task,
    });
    assertNoTaskApiQuery(request);
    const proposalId = parseTaskApiId((await context.params).proposalId);
    const idempotencyKey = parseTaskApiCreateId(request.headers);
    if (idempotencyKey !== input.applyToken) {
      throw new ApplicationError(
        "VALIDATION_FAILED",
        "The planner idempotency key must match the proposal apply token.",
      );
    }
    return privateTaskJson(await getAssistantPlannerApplication().applyProposal(actor, proposalId, input));
  });
}
