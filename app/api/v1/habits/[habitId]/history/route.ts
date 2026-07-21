import { getHabitsApplication, habitHistoryQuerySchema } from "@/modules/habits";

import {
  habitApiResponse,
  parseHabitApiId,
  parseHabitApiQuery,
  privateHabitJson,
  resolveHabitApiActor,
} from "../../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HabitRouteContext = Readonly<{ params: Promise<{ habitId: string }> }>;

export function GET(request: Request, context: HabitRouteContext) {
  return habitApiResponse(request, "habits.history", async () => {
    const actor = await resolveHabitApiActor(request);
    const query = parseHabitApiQuery(request, habitHistoryQuerySchema);
    const habitId = parseHabitApiId((await context.params).habitId);
    return privateHabitJson(await getHabitsApplication().projections.getHabitHistory(actor, habitId, query));
  });
}
