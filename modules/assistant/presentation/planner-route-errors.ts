import { PlannerApiError, type PlannerApiErrorCode } from "./data/planner-api-client";
import type { PlannerFailureKind } from "./planner-screen-model";

export type PlannerRouteError = Readonly<{
  permission: boolean;
  failure: PlannerFailureKind;
}>;

export function generationRouteError(error: unknown): PlannerRouteError {
  const code = plannerErrorCode(error);
  if (isPermissionCode(code)) return { permission: true, failure: "permission" };
  if (code === "NOT_FOUND" || code === "CONFLICT") {
    return { permission: false, failure: "input_stale" };
  }
  if (code === "VALIDATION_FAILED" || code === "INVALID_RESPONSE") {
    return { permission: false, failure: "invalid_schema" };
  }
  return { permission: false, failure: "provider" };
}

export function applyRouteError(error: unknown): PlannerRouteError {
  const code = plannerErrorCode(error);
  if (isPermissionCode(code) || code === "NOT_FOUND") {
    return { permission: true, failure: "permission" };
  }
  if (code === "CONFLICT" || code === "VALIDATION_FAILED") {
    return { permission: false, failure: "stale" };
  }
  return { permission: false, failure: "apply_unknown" };
}

export function rejectRouteError(error: unknown): PlannerRouteError {
  const code = plannerErrorCode(error);
  if (isPermissionCode(code) || code === "NOT_FOUND") {
    return { permission: true, failure: "permission" };
  }
  if (code === "CONFLICT") return { permission: false, failure: "stale" };
  return { permission: false, failure: "reject_unknown" };
}

export function refreshRouteError(error: unknown): PlannerRouteError {
  const code = plannerErrorCode(error);
  if (isPermissionCode(code) || code === "NOT_FOUND") {
    return { permission: true, failure: "permission" };
  }
  return { permission: false, failure: "refresh" };
}

export function isPlannerRequestAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function plannerErrorCode(error: unknown): PlannerApiErrorCode {
  return error instanceof PlannerApiError ? error.code : "INVALID_RESPONSE";
}

function isPermissionCode(code: PlannerApiErrorCode): boolean {
  return code === "UNAUTHENTICATED" || code === "FORBIDDEN";
}
