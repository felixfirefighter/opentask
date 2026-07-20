import {
  editRecurringTaskScheduleRequestSchema,
  endTaskRecurrenceRequestSchema,
  setTaskRecurrenceRequestSchema,
  taskRecurrenceDtoSchema,
  taskRecurrenceMutationResultSchema,
  type EditRecurringTaskScheduleRequest,
  type EndTaskRecurrenceRequest,
  type SetTaskRecurrenceRequest,
} from "../../application/contracts/recurrence-contract";
import { requestTaskJson, taskJsonMutation } from "./task-api-request";

export function getTaskRecurrence(taskId: string) {
  return requestTaskJson(`/api/v1/tasks/${taskId}/recurrence`, taskRecurrenceDtoSchema.nullable());
}

export function setTaskRecurrence(taskId: string, input: SetTaskRecurrenceRequest) {
  return requestTaskJson(
    `/api/v1/tasks/${taskId}/recurrence`,
    taskRecurrenceMutationResultSchema,
    taskJsonMutation("PATCH", setTaskRecurrenceRequestSchema.parse(input)),
  );
}

export function editRecurringTaskSchedule(taskId: string, input: EditRecurringTaskScheduleRequest) {
  return requestTaskJson(
    `/api/v1/tasks/${taskId}/recurrence/schedule`,
    taskRecurrenceMutationResultSchema,
    taskJsonMutation("PATCH", editRecurringTaskScheduleRequestSchema.parse(input)),
  );
}

export function endTaskRecurrence(taskId: string, input: EndTaskRecurrenceRequest) {
  return requestTaskJson(
    `/api/v1/tasks/${taskId}/recurrence/end`,
    taskRecurrenceMutationResultSchema,
    taskJsonMutation("POST", endTaskRecurrenceRequestSchema.parse(input)),
  );
}
