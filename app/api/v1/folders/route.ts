import { createFolderRequestSchema, folderQuerySchema, getTasksApplication } from "@/modules/tasks";

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
  return taskApiResponse(request, "folders.list", async () => {
    const actor = await resolveTaskApiActor(request);
    const query = parseTaskApiQuery(request, folderQuerySchema);
    return privateTaskJson(await getTasksApplication().folders.listFolders(actor, query));
  });
}

export function POST(request: Request) {
  return taskApiResponse(request, "folders.create", async () => {
    const { actor, input } = await readTaskApiMutation(request, createFolderRequestSchema);
    assertNoTaskApiQuery(request);
    const resourceId = parseTaskApiCreateId(request.headers);
    const result = await getTasksApplication().folders.createFolder(actor, resourceId, input);
    return taskCreateJson(result, `/api/v1/folders/${resourceId}`);
  });
}
