import { deleteTaskRequestSchema } from "@/modules/tasks";
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

type TaskRouteContext = Readonly<{ params: Promise<{ taskId: string }> }>;

export function POST(request: Request, context: TaskRouteContext) {
  return taskApiResponse(request, "tasks.delete", async () => {
    const { actor, input } = await readTaskApiMutation(request, deleteTaskRequestSchema);
    assertNoTaskApiQuery(request);
    const taskId = parseTaskApiId((await context.params).taskId);
    return privateTaskJson(await getReleaseApplications().tasks.tasks.deleteTask(actor, taskId, input));
  });
}
