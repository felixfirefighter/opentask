import { focusLinkSearchInputSchema, getFocusApplication } from "@/modules/focus";
import { z } from "zod";

import { focusApiResponse, parseFocusApiQuery, privateFocusJson, resolveFocusApiActor } from "../_support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const focusLinkSearchQuerySchema = z
  .strictObject({ q: z.string(), limit: z.coerce.number() })
  .transform((query) => focusLinkSearchInputSchema.parse(query));

export function GET(request: Request): Promise<Response> {
  return focusApiResponse(request, "focus.search-links", async () => {
    const actor = await resolveFocusApiActor(request);
    const query = parseFocusApiQuery(request, focusLinkSearchQuerySchema);
    return privateFocusJson(await getFocusApplication().searchFocusLinks(actor, query));
  });
}
