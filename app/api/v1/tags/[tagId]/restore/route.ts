import { getTasksApplication, restoreTagRequestSchema } from "@/modules/tasks";

import {
  assertNoTaskApiQuery,
  parseTaskApiId,
  privateTaskJson,
  readTaskApiMutation,
  taskApiResponse,
} from "../../../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TagRestoreRouteContext = Readonly<{ params: Promise<{ tagId: string }> }>;

export function POST(request: Request, context: TagRestoreRouteContext): Promise<Response> {
  return taskApiResponse(request, "tags.restore", async () => {
    const { actor, input } = await readTaskApiMutation(request, restoreTagRequestSchema);
    assertNoTaskApiQuery(request);
    const tagId = parseTaskApiId((await context.params).tagId);
    return privateTaskJson(await getTasksApplication().tags.restoreTag(actor, tagId, input));
  });
}
