import { companionMemoryRequestSchema, saveCompanionMemory } from "@/modules/companion";
import { getIdentityRequestSecurity, resolveActor } from "@/modules/identity";
import { observeApiRequest } from "@/shared/http/request-observability";
import { assertTrustedJsonMutation, readBoundedJson } from "@/shared/http/request-security";

export const runtime = "nodejs";

export function POST(request: Request) {
  return observeApiRequest(request, "companion.save-memory", async () => {
    assertTrustedJsonMutation(request, getIdentityRequestSecurity().trustedOrigin);
    const actor = await resolveActor(request.headers);
    const input = companionMemoryRequestSchema.parse(await readBoundedJson(request, 1_024));
    return Response.json(await saveCompanionMemory(actor, input), { status: 201 });
  });
}
