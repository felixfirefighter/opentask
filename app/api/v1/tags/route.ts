import { createTagRequestSchema, getTasksApplication, tagQuerySchema } from "@/modules/tasks";

import {
  assertNoTaskApiQuery,
  parseTaskApiCreateId,
  parseTaskApiQuery,
  privateTaskJson,
  readTaskApiMutation,
  resolveTaskApiActor,
  taskApiResponse,
  taskCreateJson,
} from "../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return taskApiResponse(request, "tags.list", async () => {
    const actor = await resolveTaskApiActor(request);
    const query = parseTaskApiQuery(request, tagQuerySchema);
    return privateTaskJson(await getTasksApplication().tags.listTags(actor, query));
  });
}

export function POST(request: Request): Promise<Response> {
  return taskApiResponse(request, "tags.create", async () => {
    const { actor, input } = await readTaskApiMutation(request, createTagRequestSchema);
    assertNoTaskApiQuery(request);
    const resourceId = parseTaskApiCreateId(request.headers);
    const result = await getTasksApplication().tags.createTag(actor, resourceId, input);
    return taskCreateJson(result, `/api/v1/tags/${result.value.id}`);
  });
}
