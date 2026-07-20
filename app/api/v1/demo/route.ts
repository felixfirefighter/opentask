import { z } from "zod";

import { enterDemo, getIdentityRequestSecurity } from "@/modules/identity";
import { observeApiRequest } from "@/shared/http/request-observability";
import { assertTrustedJsonMutation, readBoundedJson } from "@/shared/http/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const emptyDemoEntryRequestSchema = z.strictObject({});

export function POST(request: Request) {
  return observeApiRequest(request, "identity.enter-demo", async () => {
    assertTrustedJsonMutation(request, getIdentityRequestSecurity());
    emptyDemoEntryRequestSchema.parse(await readBoundedJson(request, 64));
    const result = await enterDemo(request.headers);
    const response = Response.json(
      { mode: result.mode, redirectTo: "/inbox" },
      { headers: { "cache-control": "no-store" } },
    );
    for (const cookie of result.setCookieHeaders) response.headers.append("set-cookie", cookie);
    return response;
  });
}
