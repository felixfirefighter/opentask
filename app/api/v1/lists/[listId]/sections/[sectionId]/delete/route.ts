import { deleteSectionRequestSchema, getTasksApplication } from "@/modules/tasks";

import {
  assertNoTaskApiQuery,
  parseTaskApiId,
  privateTaskJson,
  readTaskApiMutation,
  taskApiResponse,
} from "@/app/api/v1/_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SectionRouteContext = Readonly<{
  params: Promise<{ listId: string; sectionId: string }>;
}>;

export function POST(request: Request, context: SectionRouteContext) {
  return taskApiResponse(async () => {
    const { actor, input } = await readTaskApiMutation(request, deleteSectionRequestSchema);
    assertNoTaskApiQuery(request);
    const params = await context.params;
    return privateTaskJson(
      await getTasksApplication().sections.deleteSection(
        actor,
        parseTaskApiId(params.listId),
        parseTaskApiId(params.sectionId),
        input,
      ),
    );
  });
}
