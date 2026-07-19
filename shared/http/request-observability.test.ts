import { describe, expect, it } from "vitest";

import { ApplicationError } from "./application-error";
import { createApiRequestObserver, sanitizeApiRoutePattern } from "./request-observability";
import type { SafeLogCode, SafeLogFields, SafeLogger } from "../logging/logger";

const requestId = "11111111-1111-4111-8111-111111111111";

describe("API request observability", () => {
  it("records truthful success status and elapsed handler time", async () => {
    const events: Array<{ code: SafeLogCode; fields?: SafeLogFields }> = [];
    const observe = createApiRequestObserver({
      createRequestId: () => requestId,
      log: collectingLogger(events),
      now: sequenceClock(100, 124.6),
    });

    const response = await observe(
      new Request("https://example.invalid/api/health/live?title=sentinel-private-title"),
      "health.live",
      () => new Response(null, { status: 204 }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(events).toEqual([
      {
        code: "REQUEST_COMPLETED",
        fields: {
          requestId,
          correlationId: undefined,
          routePattern: "/api/health/live",
          useCase: "health.live",
          durationMs: 25,
          statusClass: "2xx",
        },
      },
    ]);
  });

  it("maps failures before recording the actual error response status", async () => {
    const events: Array<{ code: SafeLogCode; fields?: SafeLogFields }> = [];
    const observe = createApiRequestObserver({
      createRequestId: () => requestId,
      log: collectingLogger(events),
      now: sequenceClock(500, 508),
    });

    const response = await observe(
      new Request(
        "https://example.invalid/api/v1/tasks/sentinel-email@example.invalid/status?body=sentinel-body",
      ),
      "tasks.transition-status",
      () => {
        throw new ApplicationError("CONFLICT", "The task changed elsewhere.", { currentVersion: 4 });
      },
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("x-correlation-id")).toBe(requestId);
    await expect(response.json()).resolves.toMatchObject({
      code: "CONFLICT",
      correlationId: requestId,
      currentVersion: 4,
    });
    expect(events[0]).toEqual({
      code: "REQUEST_COMPLETED",
      fields: {
        requestId,
        correlationId: requestId,
        routePattern: "/api/v1/tasks/:resource/status",
        useCase: "tasks.transition-status",
        durationMs: 8,
        statusClass: "4xx",
      },
    });
    expect(JSON.stringify(events)).not.toContain("sentinel-");
  });

  it("replaces every unreviewed path segment and invalid use-case label", async () => {
    const events: Array<{ code: SafeLogCode; fields?: SafeLogFields }> = [];
    const observe = createApiRequestObserver({
      createRequestId: () => requestId,
      log: collectingLogger(events),
      now: sequenceClock(1, 1),
    });
    const request = new Request(
      "https://example.invalid/api/auth/sentinel-email@example.invalid/sentinel-private-title",
    );

    expect(sanitizeApiRoutePattern(request)).toBe("/api/auth/:resource/:resource");
    await observe(request, "sentinel-email@example.invalid", () => Response.json({ ok: true }));

    expect(events[0]?.fields).toMatchObject({
      routePattern: "/api/auth/:resource/:resource",
      useCase: "http.request",
    });
    expect(JSON.stringify(events)).not.toContain("sentinel-");
  });
});

function collectingLogger(events: Array<{ code: SafeLogCode; fields?: SafeLogFields }>): SafeLogger {
  return {
    event(code, fields) {
      events.push(fields === undefined ? { code } : { code, fields });
    },
  };
}

function sequenceClock(...values: number[]): () => number {
  return () => {
    const value = values.shift();
    if (value === undefined) throw new Error("The test clock was read too many times.");
    return value;
  };
}
