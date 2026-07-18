import { describe, expect, it } from "vitest";

import { ApplicationError } from "./application-error";
import { createProblem, problemCodes, problemResponseFromError } from "./problem";

describe("problem details", () => {
  it("freezes every stable application error code into the same envelope", () => {
    for (const code of problemCodes) {
      expect(createProblem(code, "Safe detail", "correlation-1")).toMatchObject({
        code,
        correlationId: "correlation-1",
        detail: "Safe detail",
      });
    }
  });

  it("maps internal failures to an HTTP 500 problem", () => {
    expect(createProblem("INTERNAL", "Try again", "correlation-2")).toEqual({
      type: "urn:opentask:problem:internal",
      title: "Unexpected error",
      status: 500,
      code: "INTERNAL",
      detail: "Try again",
      correlationId: "correlation-2",
    });
  });

  it("serializes with the problem media type and correlation header", async () => {
    const { problemResponse } = await import("./problem");
    const response = problemResponse(createProblem("NOT_FOUND", "Missing", "correlation-3"));

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(response.headers.get("x-correlation-id")).toBe("correlation-3");
  });

  it("exposes only a safe current version for an optimistic conflict", async () => {
    const response = problemResponseFromError(
      new ApplicationError("CONFLICT", "The record changed elsewhere.", { currentVersion: 7 }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "CONFLICT", currentVersion: 7 });
    expect(() => new ApplicationError("CONFLICT", "Invalid metadata", { currentVersion: 0 })).toThrow(
      RangeError,
    );
  });
});
