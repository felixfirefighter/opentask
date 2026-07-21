import { getHabitsApplication, setHabitScheduleRequestSchema } from "@/modules/habits";

import {
  assertNoHabitApiQuery,
  habitApiResponse,
  parseHabitApiId,
  privateHabitJson,
  readHabitApiMutation,
} from "../../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HabitRouteContext = Readonly<{ params: Promise<{ habitId: string }> }>;

export function PATCH(request: Request, context: HabitRouteContext) {
  return habitApiResponse(request, "habits.schedule", async () => {
    const { actor, input } = await readHabitApiMutation(request, setHabitScheduleRequestSchema, "PATCH");
    assertNoHabitApiQuery(request);
    const habitId = parseHabitApiId((await context.params).habitId);
    return privateHabitJson(await getHabitsApplication().schedules.setHabitSchedule(actor, habitId, input));
  });
}
