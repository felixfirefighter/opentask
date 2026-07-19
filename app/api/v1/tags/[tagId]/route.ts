import { getTasksApplication, updateTagRequestSchema } from "@/modules/tasks";

import {
  assertNoTaskApiQuery,
  parseTaskApiId,
  privateTaskJson,
  readTaskApiMutation,
  resolveTaskApiActor,
  taskApiResponse,
} from "../../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TagRouteContext = Readonly<{ params: Promise<{ tagId: string }> }>;

export function GET(request: Request, context: TagRouteContext): Promise<Response> {
  return taskApiResponse(request, "tags.get", async () => {
    const actor = await resolveTaskApiActor(request);
    assertNoTaskApiQuery(request);
    const tagId = parseTaskApiId((await context.params).tagId);
    return privateTaskJson(await getTasksApplication().tags.getTag(actor, tagId));
  });
}

export function PATCH(request: Request, context: TagRouteContext): Promise<Response> {
  return taskApiResponse(request, "tags.update", async () => {
    const { actor, input } = await readTaskApiMutation(request, updateTagRequestSchema, {
      method: "PATCH",
    });
    assertNoTaskApiQuery(request);
    const tagId = parseTaskApiId((await context.params).tagId);
    return privateTaskJson(await getTasksApplication().tags.updateTag(actor, tagId, input));
  });
}
