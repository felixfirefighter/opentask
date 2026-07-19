import { getTasksApplication, updateFolderRequestSchema } from "@/modules/tasks";

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

type FolderRouteContext = Readonly<{ params: Promise<{ folderId: string }> }>;

export function GET(request: Request, context: FolderRouteContext) {
  return taskApiResponse(request, "folders.get", async () => {
    const actor = await resolveTaskApiActor(request);
    assertNoTaskApiQuery(request);
    const folderId = parseTaskApiId((await context.params).folderId);
    return privateTaskJson(await getTasksApplication().folders.getFolder(actor, folderId));
  });
}

export function PATCH(request: Request, context: FolderRouteContext) {
  return taskApiResponse(request, "folders.update", async () => {
    const { actor, input } = await readTaskApiMutation(request, updateFolderRequestSchema, {
      method: "PATCH",
    });
    assertNoTaskApiQuery(request);
    const folderId = parseTaskApiId((await context.params).folderId);
    return privateTaskJson(await getTasksApplication().folders.updateFolder(actor, folderId, input));
  });
}
