import { createSectionRequestSchema, getTasksApplication, sectionQuerySchema } from "@/modules/tasks";

import {
  assertNoTaskApiQuery,
  parseTaskApiCreateId,
  parseTaskApiId,
  parseTaskApiQuery,
  privateTaskJson,
  readTaskApiMutation,
  resolveTaskApiActor,
  taskApiResponse,
  taskCreateJson,
} from "@/app/api/v1/_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SectionCollectionContext = Readonly<{ params: Promise<{ listId: string }> }>;

export function GET(request: Request, context: SectionCollectionContext) {
  return taskApiResponse(async () => {
    const actor = await resolveTaskApiActor(request);
    const listId = parseTaskApiId((await context.params).listId);
    const query = parseTaskApiQuery(request, sectionQuerySchema);
    return privateTaskJson(await getTasksApplication().sections.listSections(actor, listId, query));
  });
}

export function POST(request: Request, context: SectionCollectionContext) {
  return taskApiResponse(async () => {
    const { actor, input } = await readTaskApiMutation(request, createSectionRequestSchema);
    assertNoTaskApiQuery(request);
    const listId = parseTaskApiId((await context.params).listId);
    const resourceId = parseTaskApiCreateId(request.headers);
    const result = await getTasksApplication().sections.createSection(actor, listId, resourceId, input);
    return taskCreateJson(result, `/api/v1/lists/${listId}/sections/${resourceId}`);
  });
}
