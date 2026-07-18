import {
  getIdentityRequestSecurity,
  getUserPreferences,
  resolveActor,
  updateUserPreferences,
  updateUserPreferencesRequestSchema,
} from "@/modules/identity";
import { problemResponseFromError } from "@/shared/http/problem";
import { assertTrustedJsonMutation, readBoundedJson } from "@/shared/http/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await resolveActor(request.headers);
    return privateJson(await getUserPreferences(actor));
  } catch (error) {
    return problemResponseFromError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertTrustedJsonMutation(request, getIdentityRequestSecurity().trustedOrigin, "PATCH");
    const actor = await resolveActor(request.headers);
    const input = updateUserPreferencesRequestSchema.parse(await readBoundedJson(request, 2048));
    const preferences = await updateUserPreferences(actor, input.expectedVersion, input.patch);
    return privateJson(preferences);
  } catch (error) {
    return problemResponseFromError(error);
  }
}

function privateJson(value: unknown) {
  return Response.json(value, { headers: { "cache-control": "no-store" } });
}
