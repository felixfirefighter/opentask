import { getTasksApplication, setTaskScheduleRequestSchema } from "@/modules/tasks";

import {
  assertNoTaskApiQuery,
  parseTaskApiId,
  privateTaskJson,
  readTaskApiMutation,
  resolveTaskApiActor,
  taskApiResponse,
} from "@/app/api/v1/_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TaskScheduleRouteContext = Readonly<{ params: Promise<{ taskId: string }> }>;

export function GET(request: Request, context: TaskScheduleRouteContext) {
  return taskApiResponse(async () => {
    const actor = await resolveTaskApiActor(request);
    assertNoTaskApiQuery(request);
    const taskId = parseTaskApiId((await context.params).taskId);
    return privateTaskJson(await getTasksApplication().schedules.getSchedule(actor, taskId));
  });
}

export function PATCH(request: Request, context: TaskScheduleRouteContext) {
  return taskApiResponse(async () => {
    const { actor, input } = await readTaskApiMutation(request, setTaskScheduleRequestSchema, {
      method: "PATCH",
    });
    assertNoTaskApiQuery(request);
    const taskId = parseTaskApiId((await context.params).taskId);
    return privateTaskJson(await getTasksApplication().schedules.setSchedule(actor, taskId, input));
  });
}
