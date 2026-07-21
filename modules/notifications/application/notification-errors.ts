import { ApplicationError } from "@/shared/http/application-error";

export function notificationNotFound(): ApplicationError {
  return new ApplicationError("NOT_FOUND", "The requested reminder was not found.");
}

export function notificationConflict(detail: string, currentVersion?: number): ApplicationError {
  return new ApplicationError("CONFLICT", detail, {
    ...(currentVersion === undefined ? {} : { currentVersion }),
  });
}

export function staleNotification(currentVersion: number): ApplicationError {
  return notificationConflict(
    "This reminder changed elsewhere. Review the latest version and try again.",
    currentVersion,
  );
}

export function notificationValidationFailed(detail: string): ApplicationError {
  return new ApplicationError("VALIDATION_FAILED", detail);
}

export function notificationProviderUnavailable(detail: string): ApplicationError {
  return new ApplicationError("PROVIDER_UNAVAILABLE", detail);
}
