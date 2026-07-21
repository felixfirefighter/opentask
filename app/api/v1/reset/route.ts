import { z } from "zod";

import { getIdentityRequestSecurity, resetApp, resolveActor } from "@/modules/identity";
import { observeApiRequest } from "@/shared/http/request-observability";
import { assertTrustedJsonMutation, readBoundedJson } from "@/shared/http/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const emptyRequestSchema = z.strictObject({});

export function POST(request: Request) {
  return observeApiRequest(request, "identity.reset-app", async () => {
    assertTrustedJsonMutation(request, getIdentityRequestSecurity().trustedOrigin);
    const actor = await resolveActor(request.headers);
    emptyRequestSchema.parse(await readBoundedJson(request, 64));
    await resetApp(actor);
    return Response.json(
      { redirectTo: "/" },
      { headers: { "cache-control": "no-store", "set-cookie": expiredSessionCookie(request) } },
    );
  });
}

function expiredSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `omplish.session_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`;
}
