import { getHabitsApplication, habitLifecyclePageQuerySchema } from "@/modules/habits";

import { habitApiResponse, parseHabitApiQuery, privateHabitJson, resolveHabitApiActor } from "../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return habitApiResponse(request, "habits.overviews", async () => {
    const actor = await resolveHabitApiActor(request);
    const query = parseHabitApiQuery(request, habitLifecyclePageQuerySchema);
    return privateHabitJson(await getHabitsApplication().projections.listHabitOverviews(actor, query));
  });
}
