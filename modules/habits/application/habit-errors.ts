import { ApplicationError } from "@/shared/http/application-error";

export function habitNotFound(): ApplicationError {
  return new ApplicationError("NOT_FOUND", "The requested habit was not found.");
}

export function habitConflict(detail: string, currentVersion?: number): ApplicationError {
  return new ApplicationError("CONFLICT", detail, {
    ...(currentVersion === undefined ? {} : { currentVersion }),
  });
}

export function staleHabit(currentVersion: number): ApplicationError {
  return habitConflict(
    "This habit changed elsewhere. Review the latest version and try again.",
    currentVersion,
  );
}

export function habitValidationFailed(detail: string): ApplicationError {
  return new ApplicationError("VALIDATION_FAILED", detail);
}
