import { clearTaskScheduleRequestSchema } from "@/modules/tasks";
import { getReleaseApplications } from "@/server/release-applications";

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
  return taskApiResponse(request, "schedules.clear", async () => {
    const { actor, input } = await readTaskApiMutation(request, clearTaskScheduleRequestSchema);
    assertNoTaskApiQuery(request);
    const taskId = parseTaskApiId((await context.params).taskId);
    return privateTaskJson(
      await getReleaseApplications().tasks.schedules.clearSchedule(actor, taskId, input),
    );
  });
}
