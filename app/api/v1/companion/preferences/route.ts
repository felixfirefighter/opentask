import { companionPreferenceRequestSchema, updateCompanionPreferences } from "@/modules/companion";
import { getIdentityRequestSecurity, resolveActor } from "@/modules/identity";
import { observeApiRequest } from "@/shared/http/request-observability";
import { assertTrustedJsonMutation, readBoundedJson } from "@/shared/http/request-security";

export const runtime = "nodejs";

export function PATCH(request: Request) {
  return observeApiRequest(request, "companion.update-preferences", async () => {
    assertTrustedJsonMutation(request, getIdentityRequestSecurity().trustedOrigin, "PATCH");
    const actor = await resolveActor(request.headers);
    const input = companionPreferenceRequestSchema.parse(await readBoundedJson(request, 1_024));
    return Response.json(await updateCompanionPreferences(actor, input.expectedVersion, input.patch), {
      headers: { "cache-control": "no-store" },
    });
  });
}
