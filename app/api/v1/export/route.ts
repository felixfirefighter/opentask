import { resolveActor } from "@/modules/identity";
import { buildUserExportFilename, getPortabilityApplication } from "@/modules/portability";
import { ApplicationError } from "@/shared/http/application-error";
import { observeApiRequest } from "@/shared/http/request-observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return observeApiRequest(request, "portability.export", async () => {
    if (new URL(request.url).searchParams.size > 0) {
      throw new ApplicationError("VALIDATION_FAILED", "This endpoint does not accept query parameters.");
    }
    const actor = await resolveActor(request.headers);
    const envelope = await getPortabilityApplication().exportUserData(actor);
    return new Response(JSON.stringify(envelope), {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename="${buildUserExportFilename(envelope.exportedAt)}"`,
        "content-type": "application/json; charset=utf-8",
        pragma: "no-cache",
        "x-content-type-options": "nosniff",
        "x-opentask-export-schema-version": String(envelope.schemaVersion),
      },
    });
  });
}
