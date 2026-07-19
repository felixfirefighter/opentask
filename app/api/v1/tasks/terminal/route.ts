import { getTasksApplication, terminalTaskQuerySchema } from "@/modules/tasks";

import { parseTaskApiQuery, privateTaskJson, resolveTaskApiActor, taskApiResponse } from "../../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return taskApiResponse(async () => {
    const actor = await resolveTaskApiActor(request);
    const query = parseTaskApiQuery(request, terminalTaskQuerySchema);
    return privateTaskJson(await getTasksApplication().tasks.listTerminalTasks(actor, query));
  });
}
