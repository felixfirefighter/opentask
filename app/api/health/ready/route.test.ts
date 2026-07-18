import { beforeEach, describe, expect, it, vi } from "vitest";

const { assertDatabaseReady, warn } = vi.hoisted(() => ({
  assertDatabaseReady: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@/shared/health/database-readiness", () => ({ assertDatabaseReady }));
vi.mock("@/shared/logging/logger", () => ({ logger: { warn } }));

import { GET } from "./route";

describe("readiness route", () => {
  beforeEach(() => {
    assertDatabaseReady.mockReset();
    warn.mockReset();
  });

  it("returns ready after the database compatibility check", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ready" });
  });

  it("returns a safe correlated problem when the database is unavailable", async () => {
    const secret = "postgresql://user:sentinel-password@database.invalid/opentask";
    assertDatabaseReady.mockRejectedValueOnce(new Error(secret));

    const response = await GET();
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(body).toMatchObject({
      type: "urn:opentask:problem:provider-unavailable",
      status: 503,
      code: "PROVIDER_UNAVAILABLE",
      detail: "Database readiness check failed.",
    });
    expect(serialized).not.toContain(secret);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: body.correlationId, errorName: "Error" }),
      "readiness check failed",
    );
  });
});
