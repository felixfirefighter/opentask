import { getTasksApplication, replaceTaskTagsRequestSchema } from "@/modules/tasks";

import {
  assertNoTaskApiQuery,
  parseTaskApiId,
  privateTaskJson,
  readTaskApiMutation,
  taskApiResponse,
} from "@/app/api/v1/_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TaskTagsRouteContext = Readonly<{ params: Promise<{ taskId: string }> }>;

export function POST(request: Request, context: TaskTagsRouteContext) {
  return taskApiResponse(async () => {
    const { actor, input } = await readTaskApiMutation(request, replaceTaskTagsRequestSchema);
    assertNoTaskApiQuery(request);
    const taskId = parseTaskApiId((await context.params).taskId);
    return privateTaskJson(await getTasksApplication().tags.replaceTaskTags(actor, taskId, input));
  });
}
