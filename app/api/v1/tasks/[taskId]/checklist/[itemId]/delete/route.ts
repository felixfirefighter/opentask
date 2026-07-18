import { deleteChecklistItemRequestSchema, getTasksApplication } from "@/modules/tasks";

import {
  assertNoTaskApiQuery,
  parseTaskApiId,
  privateTaskJson,
  readTaskApiMutation,
  taskApiResponse,
} from "@/app/api/v1/_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChecklistRouteContext = Readonly<{
  params: Promise<{ taskId: string; itemId: string }>;
}>;

export function POST(request: Request, context: ChecklistRouteContext) {
  return taskApiResponse(async () => {
    const { actor, input } = await readTaskApiMutation(request, deleteChecklistItemRequestSchema);
    assertNoTaskApiQuery(request);
    const params = await context.params;
    return privateTaskJson(
      await getTasksApplication().checklist.deleteChecklistItem(
        actor,
        parseTaskApiId(params.taskId),
        parseTaskApiId(params.itemId),
        input,
      ),
    );
  });
}
