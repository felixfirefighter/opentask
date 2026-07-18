import { ApplicationError } from "@/shared/http/application-error";

export function taskResourceNotFound(): ApplicationError {
  return new ApplicationError("NOT_FOUND", "The requested task resource was not found.");
}

export function taskConflict(detail: string, currentVersion?: number): ApplicationError {
  return new ApplicationError("CONFLICT", detail, {
    ...(currentVersion === undefined ? {} : { currentVersion }),
  });
}

export function taskValidationFailure(detail: string): ApplicationError {
  return new ApplicationError("VALIDATION_FAILED", detail);
}

export function staleTaskResource(currentVersion: number): ApplicationError {
  return taskConflict(
    "This record changed elsewhere. Review the latest version and try again.",
    currentVersion,
  );
}
