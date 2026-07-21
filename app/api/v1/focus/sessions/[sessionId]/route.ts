import {
  correctCompletedSessionRequestSchema,
  deleteCompletedSessionRequestSchema,
  getFocusApplication,
} from "@/modules/focus";

import {
  assertNoFocusApiQuery,
  focusApiResponse,
  parseFocusApiId,
  privateFocusJson,
  readFocusApiMutation,
} from "../../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FocusSessionRouteContext = Readonly<{ params: Promise<{ sessionId: string }> }>;

export function PATCH(request: Request, context: FocusSessionRouteContext): Promise<Response> {
  return focusApiResponse(request, "focus.correct", async () => {
    const { actor, input } = await readFocusApiMutation(
      request,
      correctCompletedSessionRequestSchema,
      "PATCH",
    );
    assertNoFocusApiQuery(request);
    const sessionId = parseFocusApiId((await context.params).sessionId);
    return privateFocusJson(await getFocusApplication().correctCompletedSession(actor, sessionId, input));
  });
}

export function DELETE(request: Request, context: FocusSessionRouteContext): Promise<Response> {
  return focusApiResponse(request, "focus.delete", async () => {
    const { actor, input } = await readFocusApiMutation(
      request,
      deleteCompletedSessionRequestSchema,
      "DELETE",
    );
    assertNoFocusApiQuery(request);
    const sessionId = parseFocusApiId((await context.params).sessionId);
    return privateFocusJson(await getFocusApplication().deleteCompletedSession(actor, sessionId, input));
  });
}
