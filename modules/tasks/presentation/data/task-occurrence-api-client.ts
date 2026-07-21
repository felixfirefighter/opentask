import {
  occurrenceCommandRequestSchema,
  occurrenceCommandResultSchema,
  taskOccurrenceDtoSchema,
  type OccurrenceCommandRequest,
} from "../../application/contracts";
import { requestTaskJson, taskJsonMutation, taskQueryPath } from "./task-api-request";

export function getTaskOccurrence(taskId: string, occurrenceKey: string) {
  return requestTaskJson(
    taskQueryPath(`/api/v1/tasks/${taskId}/occurrences`, { occurrenceKey }),
    taskOccurrenceDtoSchema.nullable(),
  );
}

export function transitionTaskOccurrence(taskId: string, request: OccurrenceCommandRequest) {
  return requestTaskJson(
    `/api/v1/tasks/${taskId}/occurrences/transition`,
    occurrenceCommandResultSchema,
    taskJsonMutation("POST", occurrenceCommandRequestSchema.parse(request)),
  );
}
