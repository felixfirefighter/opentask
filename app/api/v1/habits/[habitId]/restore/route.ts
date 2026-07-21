import { getHabitsApplication, habitLifecycleRequestSchema } from "@/modules/habits";

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

export function POST(request: Request, context: HabitRouteContext) {
  return habitApiResponse(request, "habits.restore", async () => {
    const { actor, input } = await readHabitApiMutation(request, habitLifecycleRequestSchema);
    assertNoHabitApiQuery(request);
    const habitId = parseHabitApiId((await context.params).habitId);
    return privateHabitJson(await getHabitsApplication().definitions.restoreHabit(actor, habitId, input));
  });
}
