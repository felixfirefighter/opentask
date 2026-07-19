import { createTaskRequestSchema, getTasksApplication, taskQuerySchema } from "@/modules/tasks";

import {
  assertNoTaskApiQuery,
  parseTaskApiCreateId,
  parseTaskApiQuery,
  privateTaskJson,
  readTaskApiMutation,
  resolveTaskApiActor,
  taskApiResponse,
  taskCreateJson,
  taskMutationBodyLimits,
} from "@/app/api/v1/_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return taskApiResponse(request, "tasks.list", async () => {
    const actor = await resolveTaskApiActor(request);
    const query = parseTaskApiQuery(request, taskQuerySchema);
    return privateTaskJson(await getTasksApplication().tasks.listTasks(actor, query));
  });
}

export function POST(request: Request) {
  return taskApiResponse(request, "tasks.create", async () => {
    const { actor, input } = await readTaskApiMutation(request, createTaskRequestSchema, {
      maxBytes: taskMutationBodyLimits.task,
    });
    assertNoTaskApiQuery(request);
    const resourceId = parseTaskApiCreateId(request.headers);
    const result = await getTasksApplication().tasks.createTask(actor, resourceId, input);
    return taskCreateJson(result, `/api/v1/tasks/${resourceId}`);
  });
}
