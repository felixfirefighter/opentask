import { getTasksApplication, transitionTaskStatusRequestSchema } from "@/modules/tasks";

import {
  assertNoTaskApiQuery,
  parseTaskApiId,
  privateTaskJson,
  readTaskApiMutation,
  taskApiResponse,
} from "@/app/api/v1/_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TaskRouteContext = Readonly<{ params: Promise<{ taskId: string }> }>;

export function POST(request: Request, context: TaskRouteContext) {
  return taskApiResponse(async () => {
    const { actor, input } = await readTaskApiMutation(request, transitionTaskStatusRequestSchema);
    assertNoTaskApiQuery(request);
    const taskId = parseTaskApiId((await context.params).taskId);
    return privateTaskJson(await getTasksApplication().tasks.transitionTaskStatus(actor, taskId, input));
  });
}
