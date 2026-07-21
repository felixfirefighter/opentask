import { editHabitDayRequestSchema, getHabitsApplication } from "@/modules/habits";

import {
  assertNoHabitApiQuery,
  habitApiResponse,
  parseHabitApiId,
  privateHabitJson,
  readHabitApiMutation,
} from "../../../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HabitLogRouteContext = Readonly<{
  params: Promise<{ habitId: string; localDate: string }>;
}>;

export function PATCH(request: Request, context: HabitLogRouteContext) {
  return habitApiResponse(request, "habits.log-edit", async () => {
    const { actor, input } = await readHabitApiMutation(request, editHabitDayRequestSchema, "PATCH");
    assertNoHabitApiQuery(request);
    const params = await context.params;
    const habitId = parseHabitApiId(params.habitId);
    return privateHabitJson(
      await getHabitsApplication().logs.editHabitDay(actor, habitId, params.localDate, input),
    );
  });
}
