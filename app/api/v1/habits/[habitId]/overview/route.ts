import { getHabitsApplication } from "@/modules/habits";

import {
  assertNoHabitApiQuery,
  habitApiResponse,
  parseHabitApiId,
  privateHabitJson,
  resolveHabitApiActor,
} from "../../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HabitRouteContext = Readonly<{ params: Promise<{ habitId: string }> }>;

export function GET(request: Request, context: HabitRouteContext) {
  return habitApiResponse(request, "habits.overview", async () => {
    const actor = await resolveHabitApiActor(request);
    assertNoHabitApiQuery(request);
    const habitId = parseHabitApiId((await context.params).habitId);
    return privateHabitJson(await getHabitsApplication().projections.getHabitOverview(actor, habitId));
  });
}
