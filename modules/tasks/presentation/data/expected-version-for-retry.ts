import { isTaskApiError } from "./task-api-request";

export function expectedVersionForRetry(error: unknown, fallback: number): number {
  return isTaskApiError(error) && error.currentVersion ? error.currentVersion : fallback;
}
