import { clearTaskScheduleRequestSchema, getTasksApplication } from "@/modules/tasks";

import {
  assertNoTaskApiQuery,
  parseTaskApiId,
  privateTaskJson,
  readTaskApiMutation,
  taskApiResponse,
} from "@/app/api/v1/_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClearTaskScheduleRouteContext = Readonly<{ params: Promise<{ taskId: string }> }>;

export function POST(request: Request, context: ClearTaskScheduleRouteContext) {
  return taskApiResponse(async () => {
    const { actor, input } = await readTaskApiMutation(request, clearTaskScheduleRequestSchema);
    assertNoTaskApiQuery(request);
    const taskId = parseTaskApiId((await context.params).taskId);
    return privateTaskJson(await getTasksApplication().schedules.clearSchedule(actor, taskId, input));
  });
}
