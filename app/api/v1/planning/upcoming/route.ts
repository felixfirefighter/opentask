import { getPlanningProjectionApplication, projectionLimitQuerySchema } from "@/modules/planning";

import { parseTaskApiQuery, privateTaskJson, resolveTaskApiActor, taskApiResponse } from "../../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return taskApiResponse(async () => {
    const query = parseTaskApiQuery(request, projectionLimitQuerySchema);
    const actor = await resolveTaskApiActor(request);
    return privateTaskJson(await getPlanningProjectionApplication().getUpcoming(actor, query));
  });
}
