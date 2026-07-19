import { describe, expect, it } from "vitest";

import { PlannerApiError } from "./data/planner-api-client";
import {
  applyRouteError,
  generationRouteError,
  refreshRouteError,
  rejectRouteError,
} from "./planner-route-errors";

describe("planner route error policy", () => {
  it.each([
    ["PROVIDER_UNAVAILABLE", "provider"],
    ["RATE_LIMITED", "provider"],
    ["VALIDATION_FAILED", "invalid_schema"],
    ["INVALID_RESPONSE", "invalid_schema"],
    ["NOT_FOUND", "input_stale"],
  ] as const)("maps generation %s to %s", (code, failure) => {
    expect(generationRouteError(new PlannerApiError(code))).toEqual({ permission: false, failure });
  });

  it("maps authentication and authorization failures to the content-safe permission state", () => {
    expect(generationRouteError(new PlannerApiError("UNAUTHENTICATED"))).toMatchObject({
      permission: true,
    });
    expect(refreshRouteError(new PlannerApiError("FORBIDDEN"))).toMatchObject({ permission: true });
  });

  it("blocks stale apply conflicts and names uncertain mutation outcomes honestly", () => {
    expect(applyRouteError(new PlannerApiError("CONFLICT"))).toEqual({
      permission: false,
      failure: "stale",
    });
    expect(applyRouteError(new PlannerApiError("NETWORK"))).toEqual({
      permission: false,
      failure: "apply_unknown",
    });
    expect(rejectRouteError(new PlannerApiError("NETWORK"))).toEqual({
      permission: false,
      failure: "reject_unknown",
    });
  });
});
