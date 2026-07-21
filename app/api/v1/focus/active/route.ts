import { getFocusApplication } from "@/modules/focus";

import { assertNoFocusApiQuery, focusApiResponse, privateFocusJson, resolveFocusApiActor } from "../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return focusApiResponse(request, "focus.active", async () => {
    const actor = await resolveFocusApiActor(request);
    assertNoFocusApiQuery(request);
    return privateFocusJson(await getFocusApplication().getActiveFocusSession(actor));
  });
}
