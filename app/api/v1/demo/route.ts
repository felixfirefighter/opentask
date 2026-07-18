import { z } from "zod";

import { enterDemo, getIdentityRequestSecurity } from "@/modules/identity";
import { problemResponseFromError } from "@/shared/http/problem";
import { assertTrustedJsonMutation, readBoundedJson } from "@/shared/http/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const emptyDemoEntryRequestSchema = z.strictObject({});

export async function POST(request: Request) {
  try {
    assertTrustedJsonMutation(request, getIdentityRequestSecurity().trustedOrigin);
    emptyDemoEntryRequestSchema.parse(await readBoundedJson(request, 64));
    const result = await enterDemo(request.headers);
    const response = Response.json(
      { mode: result.mode, redirectTo: "/inbox" },
      { headers: { "cache-control": "no-store" } },
    );
    for (const cookie of result.setCookieHeaders) response.headers.append("set-cookie", cookie);
    return response;
  } catch (error) {
    return problemResponseFromError(error);
  }
}
