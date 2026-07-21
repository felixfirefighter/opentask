import { getHabitsApplication, recordHabitDayRequestSchema } from "@/modules/habits";

import {
  assertNoHabitApiQuery,
  habitApiResponse,
  parseHabitApiCreateId,
  parseHabitApiId,
  privateHabitJson,
  readHabitApiMutation,
} from "../../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HabitRouteContext = Readonly<{ params: Promise<{ habitId: string }> }>;

export function POST(request: Request, context: HabitRouteContext) {
  return habitApiResponse(request, "habits.log", async () => {
    const { actor, input } = await readHabitApiMutation(request, recordHabitDayRequestSchema);
    assertNoHabitApiQuery(request);
    const habitId = parseHabitApiId((await context.params).habitId);
    const logId = parseHabitApiCreateId(request.headers);
    const result = await getHabitsApplication().logs.recordHabitDay(actor, habitId, logId, input);
    return privateHabitJson(result, {
      status: result.outcome === "created" ? 201 : 200,
      ...(result.outcome === "created"
        ? { headers: { location: `/api/v1/habits/${habitId}/logs/${input.localDate}` } }
        : {}),
    });
  });
}
