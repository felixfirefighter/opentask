import { getTasksApplication, restoreFolderRequestSchema } from "@/modules/tasks";

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
  return taskApiResponse(async () => {
    const { actor, input } = await readTaskApiMutation(request, restoreFolderRequestSchema);
    assertNoTaskApiQuery(request);
    const folderId = parseTaskApiId((await context.params).folderId);
    return privateTaskJson(await getTasksApplication().folders.restoreFolder(actor, folderId, input));
  });
}
