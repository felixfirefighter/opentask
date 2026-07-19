import { createChecklistItemRequestSchema, getTasksApplication } from "@/modules/tasks";

import {
  assertNoTaskApiQuery,
  parseTaskApiCreateId,
  parseTaskApiId,
  readTaskApiMutation,
  taskApiResponse,
  taskCreateJson,
} from "@/app/api/v1/_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChecklistCollectionContext = Readonly<{ params: Promise<{ taskId: string }> }>;

export function POST(request: Request, context: ChecklistCollectionContext) {
  return taskApiResponse(request, "checklist.create", async () => {
    const { actor, input } = await readTaskApiMutation(request, createChecklistItemRequestSchema);
    assertNoTaskApiQuery(request);
    const taskId = parseTaskApiId((await context.params).taskId);
    const resourceId = parseTaskApiCreateId(request.headers);
    const result = await getTasksApplication().checklist.createChecklistItem(
      actor,
      taskId,
      resourceId,
      input,
    );
    return taskCreateJson(result, `/api/v1/tasks/${taskId}/checklist/${resourceId}`);
  });
}
