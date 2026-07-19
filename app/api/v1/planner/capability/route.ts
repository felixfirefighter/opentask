import { getAssistantPlannerApplication } from "@/modules/assistant";

import { assertNoTaskApiQuery, privateTaskJson, resolveTaskApiActor, taskApiResponse } from "../../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return taskApiResponse(async () => {
    await resolveTaskApiActor(request);
    assertNoTaskApiQuery(request);
    return privateTaskJson(getAssistantPlannerApplication().capability());
  });
}
