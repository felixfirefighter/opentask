import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { status: "ok" },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
