import { ApplicationError } from "@/shared/http/application-error";

export function focusNotFound(): ApplicationError {
  return new ApplicationError("NOT_FOUND", "The requested focus session was not found.");
}

export function focusConflict(detail: string, currentVersion?: number): ApplicationError {
  return new ApplicationError("CONFLICT", detail, {
    ...(currentVersion === undefined ? {} : { currentVersion }),
  });
}

export function staleFocus(currentVersion: number): ApplicationError {
  return focusConflict(
    "This focus session changed elsewhere. The authoritative timer has been restored.",
    currentVersion,
  );
}

export function focusValidationFailed(detail: string): ApplicationError {
  return new ApplicationError("VALIDATION_FAILED", detail);
}
