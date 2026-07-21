import { getHabitsApplication, undoHabitDayRequestSchema } from "@/modules/habits";

import {
  assertNoHabitApiQuery,
  habitApiResponse,
  parseHabitApiId,
  privateHabitJson,
  readHabitApiMutation,
} from "../../../../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HabitLogRouteContext = Readonly<{
  params: Promise<{ habitId: string; localDate: string }>;
}>;

export function POST(request: Request, context: HabitLogRouteContext) {
  return habitApiResponse(request, "habits.log-undo", async () => {
    const { actor, input } = await readHabitApiMutation(request, undoHabitDayRequestSchema);
    assertNoHabitApiQuery(request);
    const params = await context.params;
    const habitId = parseHabitApiId(params.habitId);
    return privateHabitJson(
      await getHabitsApplication().logs.undoHabitDay(actor, habitId, params.localDate, input),
    );
  });
}
