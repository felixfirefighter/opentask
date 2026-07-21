import { analyzePromptForLibrary } from "@/modules/assistant";
import { assertPromptLibraryUnlocked, promptAnalysisRequestSchema } from "@/modules/prompts";
import { getIdentityRequestSecurity, resolveActor } from "@/modules/identity";
import { observeApiRequest } from "@/shared/http/request-observability";
import { assertTrustedJsonMutation, readBoundedJson } from "@/shared/http/request-security";

export const runtime = "nodejs";

export function POST(request: Request) {
  return observeApiRequest(request, "prompts.analyze", async () => {
    assertTrustedJsonMutation(request, getIdentityRequestSecurity().trustedOrigin);
    const actor = await resolveActor(request.headers);
    await assertPromptLibraryUnlocked(actor);
    const { content } = promptAnalysisRequestSchema.parse(await readBoundedJson(request, 24_576));
    return Response.json(await analyzePromptForLibrary(actor, content), {
      headers: { "cache-control": "no-store" },
    });
  });
}
