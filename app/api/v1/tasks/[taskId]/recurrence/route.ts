import { setTaskRecurrenceRequestSchema } from "@/modules/tasks";
import { getReleaseApplications } from "@/server/release-applications";

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

type TaskRecurrenceRouteContext = Readonly<{ params: Promise<{ taskId: string }> }>;

export function GET(request: Request, context: TaskRecurrenceRouteContext) {
  return taskApiResponse(request, "recurrences.get", async () => {
    const actor = await resolveTaskApiActor(request);
    assertNoTaskApiQuery(request);
    const taskId = parseTaskApiId((await context.params).taskId);
    return privateTaskJson(await getReleaseApplications().tasks.recurrences.getRecurrence(actor, taskId));
  });
}

export function PATCH(request: Request, context: TaskRecurrenceRouteContext) {
  return taskApiResponse(request, "recurrences.update", async () => {
    const { actor, input } = await readTaskApiMutation(request, setTaskRecurrenceRequestSchema, {
      method: "PATCH",
    });
    assertNoTaskApiQuery(request);
    const taskId = parseTaskApiId((await context.params).taskId);
    return privateTaskJson(
      await getReleaseApplications().tasks.recurrences.setRecurrence(actor, taskId, input),
    );
  });
}
