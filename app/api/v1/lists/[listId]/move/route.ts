import { getTasksApplication, moveRegularListRequestSchema } from "@/modules/tasks";

import {
  assertNoTaskApiQuery,
  parseTaskApiId,
  privateTaskJson,
  readTaskApiMutation,
  taskApiResponse,
} from "@/app/api/v1/_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ListRouteContext = Readonly<{ params: Promise<{ listId: string }> }>;

export function POST(request: Request, context: ListRouteContext) {
  return taskApiResponse(request, "lists.move", async () => {
    const { actor, input } = await readTaskApiMutation(request, moveRegularListRequestSchema);
    assertNoTaskApiQuery(request);
    const listId = parseTaskApiId((await context.params).listId);
    return privateTaskJson(await getTasksApplication().lists.moveRegularList(actor, listId, input));
  });
}
