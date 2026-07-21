import { removeCompanionMemory } from "@/modules/companion";
import { getIdentityRequestSecurity, resolveActor } from "@/modules/identity";
import { observeApiRequest } from "@/shared/http/request-observability";
import { z } from "zod";

export const runtime = "nodejs";

const paramsSchema = z.object({ memoryId: z.string().uuid() });

export function DELETE(request: Request, context: { params: Promise<{ memoryId: string }> }) {
  return observeApiRequest(request, "companion.delete-memory", async () => {
    const expectedOrigin = new URL(getIdentityRequestSecurity().trustedOrigin).origin;
    if (request.headers.get("origin") !== expectedOrigin) return new Response(null, { status: 403 });
    const actor = await resolveActor(request.headers);
    const { memoryId } = paramsSchema.parse(await context.params);
    const deleted = await removeCompanionMemory(actor, memoryId);
    return new Response(null, { status: deleted ? 204 : 404 });
  });
}
