import { getHabitsApplication, habitPageQuerySchema } from "@/modules/habits";

import { habitApiResponse, parseHabitApiQuery, privateHabitJson, resolveHabitApiActor } from "../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return habitApiResponse(request, "habits.today", async () => {
    const actor = await resolveHabitApiActor(request);
    const query = parseHabitApiQuery(request, habitPageQuerySchema);
    return privateHabitJson(await getHabitsApplication().projections.getHabitToday(actor, query));
  });
}
