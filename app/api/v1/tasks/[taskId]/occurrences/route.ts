import { z } from "zod";

import { getTasksApplication, occurrenceKeySchema } from "@/modules/tasks";

import {
  parseTaskApiId,
  parseTaskApiQuery,
  privateTaskJson,
  resolveTaskApiActor,
  taskApiResponse,
} from "@/app/api/v1/_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const occurrenceDetailQuerySchema = z.strictObject({ occurrenceKey: occurrenceKeySchema });

type OccurrenceDetailRouteContext = Readonly<{ params: Promise<{ taskId: string }> }>;

export function GET(request: Request, context: OccurrenceDetailRouteContext) {
  return taskApiResponse(request, "occurrences.get", async () => {
    const actor = await resolveTaskApiActor(request);
    const query = parseTaskApiQuery(request, occurrenceDetailQuerySchema);
    const taskId = parseTaskApiId((await context.params).taskId);
    return privateTaskJson(
      await getTasksApplication().occurrences.readOccurrence(actor, taskId, query.occurrenceKey),
    );
  });
}
