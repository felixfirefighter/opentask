import { refreshCompanionSummary } from "@/modules/companion";
import { getIdentityRequestSecurity, resolveActor } from "@/modules/identity";
import { observeApiRequest } from "@/shared/http/request-observability";
import { assertTrustedJsonMutation } from "@/shared/http/request-security";

export const runtime = "nodejs";

export function POST(request: Request) {
  return observeApiRequest(request, "companion.refresh-summary", async () => {
    assertTrustedJsonMutation(request, getIdentityRequestSecurity().trustedOrigin);
    const actor = await resolveActor(request.headers);
    return Response.json(await refreshCompanionSummary(actor), { headers: { "cache-control": "no-store" } });
  });
}
