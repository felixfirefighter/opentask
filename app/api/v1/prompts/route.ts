import { createSavedPrompt, listSavedPrompts, savedPromptDraftSchema } from "@/modules/prompts";
import { getIdentityRequestSecurity, resolveActor } from "@/modules/identity";
import { observeApiRequest } from "@/shared/http/request-observability";
import { assertTrustedJsonMutation, readBoundedJson } from "@/shared/http/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return observeApiRequest(request, "prompts.list", async () => {
    const actor = await resolveActor(request.headers);
    const includeArchived = new URL(request.url).searchParams.get("archived") === "true";
    return Response.json(await listSavedPrompts(actor, includeArchived), {
      headers: { "cache-control": "no-store" },
    });
  });
}

export function POST(request: Request) {
  return observeApiRequest(request, "prompts.create", async () => {
    assertTrustedJsonMutation(request, getIdentityRequestSecurity().trustedOrigin);
    const actor = await resolveActor(request.headers);
    const input = savedPromptDraftSchema.parse(await readBoundedJson(request, 24_576));
    return Response.json(await createSavedPrompt(actor, input), {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  });
}
