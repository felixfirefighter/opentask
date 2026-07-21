import { focusTransitionRequestSchema, getFocusApplication } from "@/modules/focus";

import {
  assertNoFocusApiQuery,
  focusApiResponse,
  parseFocusApiId,
  privateFocusJson,
  readFocusApiMutation,
} from "../../../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FocusSessionRouteContext = Readonly<{ params: Promise<{ sessionId: string }> }>;

export function POST(request: Request, context: FocusSessionRouteContext): Promise<Response> {
  return focusApiResponse(request, "focus.pause", async () => {
    const { actor, input } = await readFocusApiMutation(request, focusTransitionRequestSchema);
    assertNoFocusApiQuery(request);
    const sessionId = parseFocusApiId((await context.params).sessionId);
    return privateFocusJson(await getFocusApplication().pauseFocusSession(actor, sessionId, input));
  });
}
