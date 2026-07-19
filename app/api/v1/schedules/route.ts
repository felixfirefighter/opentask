import { getTasksApplication, taskScheduleRangeQuerySchema } from "@/modules/tasks";

import {
  parseTaskApiQuery,
  privateTaskJson,
  resolveTaskApiActor,
  taskApiResponse,
} from "@/app/api/v1/_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return taskApiResponse(async () => {
    const actor = await resolveTaskApiActor(request);
    const query = parseTaskApiQuery(request, taskScheduleRangeQuerySchema);
    return privateTaskJson(await getTasksApplication().schedules.listRange(actor, query));
  });
}
