import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { assertDatabaseReady } from "@/shared/health/database-readiness";
import { createProblem, problemResponse } from "@/shared/http/problem";
import { logger } from "@/shared/logging/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await assertDatabaseReady();
    return NextResponse.json(
      { status: "ready" },
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    const correlationId = randomUUID();
    logger.warn(
      {
        code: "READINESS_FAILED",
        correlationId,
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
      "readiness check failed",
    );
    return problemResponse(
      createProblem("PROVIDER_UNAVAILABLE", "Database readiness check failed.", correlationId),
    );
  }
}
