import { describe, expect, it } from "vitest";

import { createProblem, problemCodes } from "./problem";

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
});
