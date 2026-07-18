import { handleAuthRequest } from "@/modules/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleAuthRequest(request);
}

export function POST(request: Request) {
  return handleAuthRequest(request);
}
