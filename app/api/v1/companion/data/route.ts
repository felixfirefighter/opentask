import { deleteCompanionData } from "@/modules/companion";
import { getIdentityRequestSecurity, resolveActor } from "@/modules/identity";
import { observeApiRequest } from "@/shared/http/request-observability";
import { readBoundedJson } from "@/shared/http/request-security";
import { z } from "zod";

export const runtime = "nodejs";

const confirmationSchema = z.object({ confirmation: z.literal("DELETE COMPANION DATA") }).strict();

export function DELETE(request: Request) {
  return observeApiRequest(request, "companion.delete-data", async () => {
    const expectedOrigin = new URL(getIdentityRequestSecurity().trustedOrigin).origin;
    if (request.method !== "DELETE" || request.headers.get("origin") !== expectedOrigin) {
      return new Response(null, { status: 403 });
    }
    confirmationSchema.parse(await readBoundedJson(request, 128));
    const actor = await resolveActor(request.headers);
    await deleteCompanionData(actor);
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  });
}
