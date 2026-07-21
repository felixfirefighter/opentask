import { editRecurringTaskScheduleRequestSchema } from "@/modules/tasks";
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

type RecurringScheduleRouteContext = Readonly<{ params: Promise<{ taskId: string }> }>;

export function PATCH(request: Request, context: RecurringScheduleRouteContext) {
  return taskApiResponse(request, "recurrences.update-schedule", async () => {
    const { actor, input } = await readTaskApiMutation(request, editRecurringTaskScheduleRequestSchema, {
      method: "PATCH",
    });
    assertNoTaskApiQuery(request);
    const taskId = parseTaskApiId((await context.params).taskId);
    return privateTaskJson(
      await getReleaseApplications().tasks.recurrences.editRecurringSchedule(actor, taskId, input),
    );
  });
}
