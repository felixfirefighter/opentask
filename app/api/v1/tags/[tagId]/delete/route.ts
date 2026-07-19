import { deleteTagRequestSchema, getTasksApplication } from "@/modules/tasks";

import {
  assertNoTaskApiQuery,
  parseTaskApiId,
  privateTaskJson,
  readTaskApiMutation,
  taskApiResponse,
} from "../../../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TagDeleteRouteContext = Readonly<{ params: Promise<{ tagId: string }> }>;

export function POST(request: Request, context: TagDeleteRouteContext): Promise<Response> {
  return taskApiResponse(request, "tags.delete", async () => {
    const { actor, input } = await readTaskApiMutation(request, deleteTagRequestSchema);
    assertNoTaskApiQuery(request);
    const tagId = parseTaskApiId((await context.params).tagId);
    return privateTaskJson(await getTasksApplication().tags.deleteTag(actor, tagId, input));
  });
}
