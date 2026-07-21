import { getHabitsApplication, updateHabitRequestSchema } from "@/modules/habits";

import {
  assertNoHabitApiQuery,
  habitApiResponse,
  parseHabitApiId,
  privateHabitJson,
  readHabitApiMutation,
  resolveHabitApiActor,
} from "../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HabitRouteContext = Readonly<{ params: Promise<{ habitId: string }> }>;

export function GET(request: Request, context: HabitRouteContext) {
  return habitApiResponse(request, "habits.get", async () => {
    const actor = await resolveHabitApiActor(request);
    assertNoHabitApiQuery(request);
    const habitId = parseHabitApiId((await context.params).habitId);
    return privateHabitJson(await getHabitsApplication().definitions.getHabit(actor, habitId));
  });
}

export function PATCH(request: Request, context: HabitRouteContext) {
  return habitApiResponse(request, "habits.update", async () => {
    const { actor, input } = await readHabitApiMutation(request, updateHabitRequestSchema, "PATCH");
    assertNoHabitApiQuery(request);
    const habitId = parseHabitApiId((await context.params).habitId);
    return privateHabitJson(await getHabitsApplication().definitions.updateHabit(actor, habitId, input));
  });
}
