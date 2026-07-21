import { endTaskRecurrenceRequestSchema } from "@/modules/tasks";
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

type EndTaskRecurrenceRouteContext = Readonly<{ params: Promise<{ taskId: string }> }>;

export function POST(request: Request, context: EndTaskRecurrenceRouteContext) {
  return taskApiResponse(request, "recurrences.end", async () => {
    const { actor, input } = await readTaskApiMutation(request, endTaskRecurrenceRequestSchema);
    assertNoTaskApiQuery(request);
    const taskId = parseTaskApiId((await context.params).taskId);
    return privateTaskJson(
      await getReleaseApplications().tasks.recurrences.endRecurrence(actor, taskId, input),
    );
  });
}
