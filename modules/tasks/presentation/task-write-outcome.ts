import { isTaskApiError } from "./data/task-api-request";

export type TaskWriteOutcome = "conflict" | "rejected" | "unconfirmed";

export function classifyTaskWriteOutcome(error: unknown): TaskWriteOutcome {
  if (!isTaskApiError(error)) return "unconfirmed";
  if (error.code === "CONFLICT" || error.status === 409) return "conflict";
  if (error.status >= 400 && error.status < 500) return "rejected";
  return "unconfirmed";
}
