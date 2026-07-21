import { companionChatRequestSchema, createCompanionChat } from "@/modules/companion";
import { getIdentityRequestSecurity, resolveActor } from "@/modules/identity";
import { observeApiRequest } from "@/shared/http/request-observability";
import { assertTrustedJsonMutation, readBoundedJson } from "@/shared/http/request-security";

export const runtime = "nodejs";

export function POST(request: Request) {
  return observeApiRequest(request, "companion.chat", async () => {
    assertTrustedJsonMutation(request, getIdentityRequestSecurity().trustedOrigin);
    const actor = await resolveActor(request.headers);
    const input = companionChatRequestSchema.parse(await readBoundedJson(request, 2_048));
    return Response.json(await createCompanionChat(actor, input), {
      headers: { "cache-control": "no-store" },
    });
  });
}
