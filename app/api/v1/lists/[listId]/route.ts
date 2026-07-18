import { getTasksApplication, updateRegularListRequestSchema } from "@/modules/tasks";

import {
  assertNoTaskApiQuery,
  parseTaskApiId,
  privateTaskJson,
  readTaskApiMutation,
  resolveTaskApiActor,
  taskApiResponse,
} from "@/app/api/v1/_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ListRouteContext = Readonly<{ params: Promise<{ listId: string }> }>;

export function GET(request: Request, context: ListRouteContext) {
  return taskApiResponse(async () => {
    const actor = await resolveTaskApiActor(request);
    assertNoTaskApiQuery(request);
    const listId = parseTaskApiId((await context.params).listId);
    return privateTaskJson(await getTasksApplication().lists.getRegularList(actor, listId));
  });
}

export function PATCH(request: Request, context: ListRouteContext) {
  return taskApiResponse(async () => {
    const { actor, input } = await readTaskApiMutation(request, updateRegularListRequestSchema, {
      method: "PATCH",
    });
    assertNoTaskApiQuery(request);
    const listId = parseTaskApiId((await context.params).listId);
    return privateTaskJson(await getTasksApplication().lists.updateRegularList(actor, listId, input));
  });
}
