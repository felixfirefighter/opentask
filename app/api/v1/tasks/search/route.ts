import { getTasksApplication, taskSearchQuerySchema } from "@/modules/tasks";

import { parseTaskApiQuery, privateTaskJson, resolveTaskApiActor, taskApiResponse } from "../../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return taskApiResponse(request, "tasks.search", async () => {
    const actor = await resolveTaskApiActor(request);
    const query = parseTaskApiQuery(request, taskSearchQuerySchema);
    return privateTaskJson(await getTasksApplication().search.searchTasks(actor, query));
  });
}
