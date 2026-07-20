import { createTaskWithScheduleRequestSchema, getTasksApplication } from "@/modules/tasks";

import {
  assertNoTaskApiQuery,
  parseTaskApiCreateId,
  readTaskApiMutation,
  taskApiResponse,
  taskCreateJson,
  taskMutationBodyLimits,
} from "../../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return taskApiResponse(request, "tasks.create-with-schedule", async () => {
    const { actor, input } = await readTaskApiMutation(request, createTaskWithScheduleRequestSchema, {
      maxBytes: taskMutationBodyLimits.task,
    });
    assertNoTaskApiQuery(request);
    const resourceId = parseTaskApiCreateId(request.headers);
    const result = await getTasksApplication().tasks.createTaskWithSchedule(actor, resourceId, input);
    return taskCreateJson(result, `/api/v1/tasks/${resourceId}`);
  });
}
