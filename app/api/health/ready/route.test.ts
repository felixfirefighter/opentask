import { beforeEach, describe, expect, it, vi } from "vitest";

const { assertDatabaseReady, event } = vi.hoisted(() => ({
  assertDatabaseReady: vi.fn(),
  event: vi.fn(),
}));

vi.mock("@/shared/health/database-readiness", () => ({ assertDatabaseReady }));
vi.mock("@/shared/logging/logger", () => ({ logger: { event } }));

import { GET } from "./route";

describe("readiness route", () => {
  beforeEach(() => {
    assertDatabaseReady.mockReset();
    event.mockReset();
  });

  it("returns ready after the database compatibility check", async () => {
    const response = await GET(new Request("http://localhost/api/health/ready"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ready" });
  });

  it("returns a safe correlated problem when the database is unavailable", async () => {
    const secret = "postgresql://user:sentinel-password@database.invalid/omplish";
    assertDatabaseReady.mockRejectedValueOnce(new Error(secret));

    const response = await GET(new Request("http://localhost/api/health/ready"));
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(body).toMatchObject({
      type: "urn:omplish:problem:provider-unavailable",
      status: 503,
      code: "PROVIDER_UNAVAILABLE",
      detail: "Database readiness check failed.",
    });
    expect(serialized).not.toContain(secret);
    expect(event).toHaveBeenCalledWith(
      "READINESS_FAILED",
      expect.objectContaining({ correlationId: body.correlationId, errorName: "Error" }),
    );
  });
});
