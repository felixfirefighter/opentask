import { getTasksApplication, quickAddRequestSchema } from "@/modules/tasks";

import {
  assertNoTaskApiQuery,
  privateTaskJson,
  readTaskApiMutation,
  taskApiResponse,
} from "@/app/api/v1/_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return taskApiResponse(request, "tasks.parse-quick-add", async () => {
    const { input } = await readTaskApiMutation(request, quickAddRequestSchema);
    assertNoTaskApiQuery(request);
    return privateTaskJson(getTasksApplication().quickAdd.parseQuickAdd(input));
  });
}
