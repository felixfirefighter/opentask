import { getTasksApplication, updateSectionRequestSchema } from "@/modules/tasks";

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

type SectionRouteContext = Readonly<{
  params: Promise<{ listId: string; sectionId: string }>;
}>;

export function GET(request: Request, context: SectionRouteContext) {
  return taskApiResponse(async () => {
    const actor = await resolveTaskApiActor(request);
    assertNoTaskApiQuery(request);
    const params = await context.params;
    return privateTaskJson(
      await getTasksApplication().sections.getSection(
        actor,
        parseTaskApiId(params.listId),
        parseTaskApiId(params.sectionId),
      ),
    );
  });
}

export function PATCH(request: Request, context: SectionRouteContext) {
  return taskApiResponse(async () => {
    const { actor, input } = await readTaskApiMutation(request, updateSectionRequestSchema, {
      method: "PATCH",
    });
    assertNoTaskApiQuery(request);
    const params = await context.params;
    return privateTaskJson(
      await getTasksApplication().sections.updateSection(
        actor,
        parseTaskApiId(params.listId),
        parseTaskApiId(params.sectionId),
        input,
      ),
    );
  });
}
