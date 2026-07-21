import { z } from "zod";

import { getOpenAISettings, saveOpenAIKey, updateOpenAIKey } from "@/modules/assistant";
import { getIdentityRequestSecurity, resolveActor } from "@/modules/identity";
import { observeApiRequest } from "@/shared/http/request-observability";
import { assertTrustedJsonMutation, readBoundedJson } from "@/shared/http/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.strictObject({ apiKey: z.string().max(512).nullable() });

export function GET(request: Request) {
  return observeApiRequest(request, "assistant.get-openai-settings", async () => {
    const actor = await resolveActor(request.headers);
    return privateJson(await getOpenAISettings(actor));
  });
}

export function PATCH(request: Request) {
  return observeApiRequest(request, "assistant.update-openai-settings", async () => {
    assertTrustedJsonMutation(request, getIdentityRequestSecurity().trustedOrigin, "PATCH");
    const actor = await resolveActor(request.headers);
    const input = updateSchema.parse(await readBoundedJson(request, 1024));
    if (input.apiKey?.trim()) {
      const result = await saveOpenAIKey(actor, input.apiKey);
      if (!result.ok) {
        const status = result.reason === "invalid" ? 422 : 503;
        return Response.json(result, { status, headers: { "cache-control": "no-store" } });
      }
      return privateJson(await getOpenAISettings(actor));
    }
    return privateJson(await updateOpenAIKey(actor, null));
  });
}

function privateJson(value: unknown) {
  return Response.json(value, { headers: { "cache-control": "no-store" } });
}
