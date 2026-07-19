import { getTasksApplication, updateTaskRequestSchema } from "@/modules/tasks";

import {
  assertNoTaskApiQuery,
  parseTaskApiId,
  privateTaskJson,
  readTaskApiMutation,
  resolveTaskApiActor,
  taskApiResponse,
  taskMutationBodyLimits,
} from "@/app/api/v1/_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TaskRouteContext = Readonly<{ params: Promise<{ taskId: string }> }>;

export function GET(request: Request, context: TaskRouteContext) {
  return taskApiResponse(request, "tasks.get", async () => {
    const actor = await resolveTaskApiActor(request);
    assertNoTaskApiQuery(request);
    const taskId = parseTaskApiId((await context.params).taskId);
    return privateTaskJson(await getTasksApplication().tasks.getTask(actor, taskId));
  });
}

export function PATCH(request: Request, context: TaskRouteContext) {
  return taskApiResponse(request, "tasks.update", async () => {
    const { actor, input } = await readTaskApiMutation(request, updateTaskRequestSchema, {
      method: "PATCH",
      maxBytes: taskMutationBodyLimits.task,
    });
    assertNoTaskApiQuery(request);
    const taskId = parseTaskApiId((await context.params).taskId);
    return privateTaskJson(await getTasksApplication().tasks.updateTask(actor, taskId, input));
  });
}
