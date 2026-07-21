import {
  createHabitRequestSchema,
  getHabitsApplication,
  habitLifecyclePageQuerySchema,
} from "@/modules/habits";

import {
  assertNoHabitApiQuery,
  habitApiResponse,
  habitCreateJson,
  parseHabitApiCreateId,
  parseHabitApiQuery,
  privateHabitJson,
  readHabitApiMutation,
  resolveHabitApiActor,
} from "./_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return habitApiResponse(request, "habits.list", async () => {
    const actor = await resolveHabitApiActor(request);
    const query = parseHabitApiQuery(request, habitLifecyclePageQuerySchema);
    return privateHabitJson(await getHabitsApplication().definitions.listHabits(actor, query));
  });
}

export function POST(request: Request) {
  return habitApiResponse(request, "habits.create", async () => {
    const { actor, input } = await readHabitApiMutation(request, createHabitRequestSchema);
    assertNoHabitApiQuery(request);
    const habitId = parseHabitApiCreateId(request.headers);
    const result = await getHabitsApplication().definitions.createHabit(actor, habitId, input);
    return habitCreateJson(result, `/api/v1/habits/${habitId}`);
  });
}
