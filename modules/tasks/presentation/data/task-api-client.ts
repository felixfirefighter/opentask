import {
  checklistItemDtoSchema,
  createChecklistItemRequestSchema,
  createTaskRequestSchema,
  deleteChecklistItemRequestSchema,
  deleteTaskRequestSchema,
  moveTaskRequestSchema,
  positionChecklistItemRequestSchema,
  positionTaskRequestSchema,
  replaceTaskTagsOutputSchema,
  replaceTaskTagsRequestSchema,
  restoreTaskRequestSchema,
  taskDetailDtoSchema,
  taskDtoSchema,
  taskPageSchema,
  taskQuerySchema,
  taskSearchPageSchema,
  taskSearchQuerySchema,
  terminalTaskQuerySchema,
  transitionTaskStatusRequestSchema,
  updateChecklistItemRequestSchema,
  updateTaskRequestSchema,
  type CreateChecklistItemRequest,
  type CreateTaskRequest,
  type MoveTaskRequest,
  type PositionChecklistItemRequest,
  type PositionTaskRequest,
  type ReplaceTaskTagsRequest,
  type TaskQuery,
  type TaskSearchQuery,
  type TerminalTaskQuery,
  type TransitionTaskStatusRequest,
  type UpdateChecklistItemRequest,
  type UpdateTaskRequest,
} from "../../application/contracts";
import { requestTaskJson, taskJsonMutation, taskQueryPath } from "./task-api-request";

export function listTasks(query: TaskQuery) {
  const input = taskQuerySchema.parse(query);
  return requestTaskJson(
    taskQueryPath("/api/v1/tasks", {
      listId: input.listId,
      sectionId: input.sectionId,
      parentTaskId: input.parentTaskId,
      status: input.status,
      cursor: input.cursor,
      limit: input.limit,
    }),
    taskPageSchema,
  );
}

export function listTerminalTasks(query: TerminalTaskQuery) {
  const input = terminalTaskQuerySchema.parse(query);
  return requestTaskJson(taskQueryPath("/api/v1/tasks/terminal", input), taskPageSchema);
}

export function searchTasks(query: TaskSearchQuery) {
  const input = taskSearchQuerySchema.parse(query);
  return requestTaskJson(taskQueryPath("/api/v1/tasks/search", input), taskSearchPageSchema);
}

export function getTask(taskId: string) {
  return requestTaskJson(`/api/v1/tasks/${taskId}`, taskDetailDtoSchema);
}

export function createTask(resourceId: string, input: CreateTaskRequest) {
  return requestTaskJson(
    "/api/v1/tasks",
    taskDtoSchema,
    taskJsonMutation("POST", createTaskRequestSchema.parse(input), { "idempotency-key": resourceId }),
  );
}

export function updateTask(taskId: string, input: UpdateTaskRequest) {
  return requestTaskJson(
    `/api/v1/tasks/${taskId}`,
    taskDtoSchema,
    taskJsonMutation("PATCH", updateTaskRequestSchema.parse(input)),
  );
}

export function transitionTaskStatus(taskId: string, input: TransitionTaskStatusRequest) {
  return requestTaskJson(
    `/api/v1/tasks/${taskId}/status`,
    taskDtoSchema,
    taskJsonMutation("POST", transitionTaskStatusRequestSchema.parse(input)),
  );
}

export function moveTask(taskId: string, input: MoveTaskRequest) {
  return requestTaskJson(
    `/api/v1/tasks/${taskId}/move`,
    taskDtoSchema,
    taskJsonMutation("POST", moveTaskRequestSchema.parse(input)),
  );
}

export function positionTask(taskId: string, input: PositionTaskRequest) {
  return requestTaskJson(
    `/api/v1/tasks/${taskId}/position`,
    taskDtoSchema,
    taskJsonMutation("POST", positionTaskRequestSchema.parse(input)),
  );
}

export function deleteTask(taskId: string, expectedVersion: number) {
  return requestTaskJson(
    `/api/v1/tasks/${taskId}/delete`,
    taskDtoSchema,
    taskJsonMutation("POST", deleteTaskRequestSchema.parse({ expectedVersion })),
  );
}

export function restoreTask(taskId: string, expectedVersion: number) {
  return requestTaskJson(
    `/api/v1/tasks/${taskId}/restore`,
    taskDtoSchema,
    taskJsonMutation("POST", restoreTaskRequestSchema.parse({ expectedVersion })),
  );
}

export function replaceTaskTags(taskId: string, input: ReplaceTaskTagsRequest) {
  return requestTaskJson(
    `/api/v1/tasks/${taskId}/tags`,
    replaceTaskTagsOutputSchema,
    taskJsonMutation("POST", replaceTaskTagsRequestSchema.parse(input)),
  );
}

export function createChecklistItem(taskId: string, resourceId: string, input: CreateChecklistItemRequest) {
  return requestTaskJson(
    `/api/v1/tasks/${taskId}/checklist`,
    checklistItemDtoSchema,
    taskJsonMutation("POST", createChecklistItemRequestSchema.parse(input), {
      "idempotency-key": resourceId,
    }),
  );
}

export function updateChecklistItem(taskId: string, itemId: string, input: UpdateChecklistItemRequest) {
  return requestTaskJson(
    `/api/v1/tasks/${taskId}/checklist/${itemId}`,
    checklistItemDtoSchema,
    taskJsonMutation("PATCH", updateChecklistItemRequestSchema.parse(input)),
  );
}

export function positionChecklistItem(taskId: string, itemId: string, input: PositionChecklistItemRequest) {
  return requestTaskJson(
    `/api/v1/tasks/${taskId}/checklist/${itemId}/position`,
    checklistItemDtoSchema,
    taskJsonMutation("POST", positionChecklistItemRequestSchema.parse(input)),
  );
}

export function deleteChecklistItem(taskId: string, itemId: string, expectedVersion: number) {
  return requestTaskJson(
    `/api/v1/tasks/${taskId}/checklist/${itemId}/delete`,
    checklistItemDtoSchema,
    taskJsonMutation("POST", deleteChecklistItemRequestSchema.parse({ expectedVersion })),
  );
}
