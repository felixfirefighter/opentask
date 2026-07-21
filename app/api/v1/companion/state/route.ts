import { getCompanionState } from "@/modules/companion";
import { resolveActor } from "@/modules/identity";
import { observeApiRequest } from "@/shared/http/request-observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return observeApiRequest(request, "companion.get-state", async () => {
    const actor = await resolveActor(request.headers);
    return Response.json(await getCompanionState(actor), { headers: { "cache-control": "no-store" } });
  });
}
