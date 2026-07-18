import { getTasksApplication, restoreRegularListRequestSchema } from "@/modules/tasks";

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
  return taskApiResponse(async () => {
    const { actor, input } = await readTaskApiMutation(request, restoreRegularListRequestSchema);
    assertNoTaskApiQuery(request);
    const listId = parseTaskApiId((await context.params).listId);
    return privateTaskJson(await getTasksApplication().lists.restoreRegularList(actor, listId, input));
  });
}
