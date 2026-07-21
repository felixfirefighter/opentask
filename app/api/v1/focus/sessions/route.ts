import { focusHistoryQuerySchema, focusStartRequestSchema, getFocusApplication } from "@/modules/focus";

import {
  assertNoFocusApiQuery,
  combineFocusStartInput,
  focusApiResponse,
  focusStartJson,
  parseFocusApiCreateId,
  parseFocusApiQuery,
  privateFocusJson,
  readFocusApiMutation,
  resolveFocusApiActor,
} from "../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return focusApiResponse(request, "focus.history", async () => {
    const actor = await resolveFocusApiActor(request);
    const query = parseFocusApiQuery(request, focusHistoryQuerySchema);
    return privateFocusJson(await getFocusApplication().listRecentFocusSessions(actor, query));
  });
}

export function POST(request: Request): Promise<Response> {
  return focusApiResponse(request, "focus.start", async () => {
    const { actor, input: startRequest } = await readFocusApiMutation(request, focusStartRequestSchema);
    assertNoFocusApiQuery(request);
    const id = parseFocusApiCreateId(request.headers);
    const result = await getFocusApplication().startFocusSession(
      actor,
      combineFocusStartInput(id, startRequest),
    );
    return focusStartJson(result);
  });
}
