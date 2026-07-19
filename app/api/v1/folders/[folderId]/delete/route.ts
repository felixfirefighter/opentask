import { deleteFolderRequestSchema, getTasksApplication } from "@/modules/tasks";

import {
  assertNoTaskApiQuery,
  parseTaskApiId,
  privateTaskJson,
  readTaskApiMutation,
  taskApiResponse,
} from "@/app/api/v1/_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FolderRouteContext = Readonly<{ params: Promise<{ folderId: string }> }>;

export function POST(request: Request, context: FolderRouteContext) {
  return taskApiResponse(request, "folders.delete", async () => {
    const { actor, input } = await readTaskApiMutation(request, deleteFolderRequestSchema);
    assertNoTaskApiQuery(request);
    const folderId = parseTaskApiId((await context.params).folderId);
    return privateTaskJson(await getTasksApplication().folders.deleteFolder(actor, folderId, input));
  });
}
