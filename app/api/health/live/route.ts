import { NextResponse } from "next/server";

import { observeApiRequest } from "@/shared/http/request-observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return observeApiRequest(request, "health.live", () =>
    NextResponse.json(
      { status: "ok" },
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    ),
  );
}
