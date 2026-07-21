import { companionDailyModeRequestSchema, setCompanionDailyMode } from "@/modules/companion";
import { getIdentityRequestSecurity, resolveActor } from "@/modules/identity";
import { observeApiRequest } from "@/shared/http/request-observability";
import { assertTrustedJsonMutation, readBoundedJson } from "@/shared/http/request-security";

export const runtime = "nodejs";

export function POST(request: Request) {
  return observeApiRequest(request, "companion.set-daily-mode", async () => {
    assertTrustedJsonMutation(request, getIdentityRequestSecurity().trustedOrigin);
    const actor = await resolveActor(request.headers);
    const input = companionDailyModeRequestSchema.parse(await readBoundedJson(request, 256));
    return Response.json(await setCompanionDailyMode(actor, input.mode), {
      headers: { "cache-control": "no-store" },
    });
  });
}
