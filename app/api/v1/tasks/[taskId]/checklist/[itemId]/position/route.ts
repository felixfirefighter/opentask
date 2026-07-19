import { getTasksApplication, positionChecklistItemRequestSchema } from "@/modules/tasks";

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
  return taskApiResponse(request, "checklist.position", async () => {
    const { actor, input } = await readTaskApiMutation(request, positionChecklistItemRequestSchema);
    assertNoTaskApiQuery(request);
    const params = await context.params;
    return privateTaskJson(
      await getTasksApplication().checklist.positionChecklistItem(
        actor,
        parseTaskApiId(params.taskId),
        parseTaskApiId(params.itemId),
        input,
      ),
    );
  });
}
