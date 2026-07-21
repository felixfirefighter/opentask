import { getAssistantPlannerApplication } from "@/modules/assistant";

import { assertNoTaskApiQuery, privateTaskJson, resolveTaskApiActor, taskApiResponse } from "../../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return taskApiResponse(request, "planner.capability", async () => {
    const actor = await resolveTaskApiActor(request);
    assertNoTaskApiQuery(request);
    return privateTaskJson(await getAssistantPlannerApplication().capability(actor));
  });
}
