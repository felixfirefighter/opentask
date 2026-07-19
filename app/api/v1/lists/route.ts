import { createRegularListRequestSchema, getTasksApplication, regularListQuerySchema } from "@/modules/tasks";

import {
  assertNoTaskApiQuery,
  parseTaskApiCreateId,
  parseTaskApiQuery,
  privateTaskJson,
  readTaskApiMutation,
  resolveTaskApiActor,
  taskApiResponse,
  taskCreateJson,
} from "@/app/api/v1/_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return taskApiResponse(request, "lists.list", async () => {
    const actor = await resolveTaskApiActor(request);
    const query = parseTaskApiQuery(request, regularListQuerySchema);
    return privateTaskJson(await getTasksApplication().lists.listRegularLists(actor, query));
  });
}

export function POST(request: Request) {
  return taskApiResponse(request, "lists.create", async () => {
    const { actor, input } = await readTaskApiMutation(request, createRegularListRequestSchema);
    assertNoTaskApiQuery(request);
    const resourceId = parseTaskApiCreateId(request.headers);
    const result = await getTasksApplication().lists.createRegularList(actor, resourceId, input);
    return taskCreateJson(result, `/api/v1/lists/${resourceId}`);
  });
}
