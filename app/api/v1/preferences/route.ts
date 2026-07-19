import {
  getIdentityRequestSecurity,
  getUserPreferences,
  resolveActor,
  updateUserPreferences,
  updateUserPreferencesRequestSchema,
} from "@/modules/identity";
import { observeApiRequest } from "@/shared/http/request-observability";
import { assertTrustedJsonMutation, readBoundedJson } from "@/shared/http/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return observeApiRequest(request, "identity.get-preferences", async () => {
    const actor = await resolveActor(request.headers);
    return privateJson(await getUserPreferences(actor));
  });
}

export function PATCH(request: Request) {
  return observeApiRequest(request, "identity.update-preferences", async () => {
    assertTrustedJsonMutation(request, getIdentityRequestSecurity().trustedOrigin, "PATCH");
    const actor = await resolveActor(request.headers);
    const input = updateUserPreferencesRequestSchema.parse(await readBoundedJson(request, 2048));
    const preferences = await updateUserPreferences(actor, input.expectedVersion, input.patch);
    return privateJson(preferences);
  });
}

function privateJson(value: unknown) {
  return Response.json(value, { headers: { "cache-control": "no-store" } });
}
