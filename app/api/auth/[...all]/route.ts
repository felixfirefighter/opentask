import { handleAuthRequest } from "@/modules/identity";
import { observeApiRequest } from "@/shared/http/request-observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return observeApiRequest(request, "identity.auth", () => handleAuthRequest(request));
}

export function POST(request: Request) {
  return observeApiRequest(request, "identity.auth", () => handleAuthRequest(request));
}
