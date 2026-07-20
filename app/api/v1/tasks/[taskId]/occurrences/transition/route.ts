import { getTasksApplication, occurrenceCommandRequestSchema } from "@/modules/tasks";

import {
  assertNoTaskApiQuery,
  parseTaskApiId,
  privateTaskJson,
  readTaskApiMutation,
  taskApiResponse,
} from "@/app/api/v1/_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OccurrenceTransitionRouteContext = Readonly<{ params: Promise<{ taskId: string }> }>;

export function POST(request: Request, context: OccurrenceTransitionRouteContext) {
  return taskApiResponse(request, "occurrences.transition", async () => {
    const { actor, input } = await readTaskApiMutation(request, occurrenceCommandRequestSchema);
    assertNoTaskApiQuery(request);
    const taskId = parseTaskApiId((await context.params).taskId);
    return privateTaskJson(
      await getTasksApplication().occurrences.transitionOccurrence(actor, taskId, input),
    );
  });
}
