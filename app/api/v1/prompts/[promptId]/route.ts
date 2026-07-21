import {
  getSavedPrompt,
  removeSavedPrompt,
  savedPromptUpdateSchema,
  updateSavedPrompt,
} from "@/modules/prompts";
import { getIdentityRequestSecurity, resolveActor } from "@/modules/identity";
import { observeApiRequest } from "@/shared/http/request-observability";
import { assertTrustedJsonMutation, readBoundedJson } from "@/shared/http/request-security";
import { z } from "zod";

export const runtime = "nodejs";

const paramsSchema = z.object({ promptId: z.string().uuid() });

export async function GET(request: Request, context: { params: Promise<{ promptId: string }> }) {
  return observeApiRequest(request, "prompts.get", async () => {
    const actor = await resolveActor(request.headers);
    const { promptId } = paramsSchema.parse(await context.params);
    const prompt = await getSavedPrompt(actor, promptId);
    return prompt
      ? Response.json(prompt, { headers: { "cache-control": "no-store" } })
      : new Response(null, { status: 404 });
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ promptId: string }> }) {
  return observeApiRequest(request, "prompts.update", async () => {
    assertTrustedJsonMutation(request, getIdentityRequestSecurity().trustedOrigin, "PATCH");
    const actor = await resolveActor(request.headers);
    const { promptId } = paramsSchema.parse(await context.params);
    const input = savedPromptUpdateSchema.parse(await readBoundedJson(request, 24_576));
    return Response.json(await updateSavedPrompt(actor, promptId, input), {
      headers: { "cache-control": "no-store" },
    });
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ promptId: string }> }) {
  return observeApiRequest(request, "prompts.delete", async () => {
    const expectedOrigin = new URL(getIdentityRequestSecurity().trustedOrigin).origin;
    if (request.headers.get("origin") !== expectedOrigin) return new Response(null, { status: 403 });
    const actor = await resolveActor(request.headers);
    const { promptId } = paramsSchema.parse(await context.params);
    return new Response(null, { status: (await removeSavedPrompt(actor, promptId)) ? 204 : 404 });
  });
}
