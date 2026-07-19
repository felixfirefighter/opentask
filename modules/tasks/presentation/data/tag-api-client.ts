import {
  createTagRequestSchema,
  deleteTagRequestSchema,
  restoreTagRequestSchema,
  tagDtoSchema,
  tagPageSchema,
  updateTagRequestSchema,
  type CreateTagRequest,
  type UpdateTagRequest,
} from "../../application/contracts";
import { requestTaskJson, taskJsonMutation, taskQueryPath } from "./task-api-request";

export function listTags(cursor?: string) {
  return requestTaskJson(taskQueryPath("/api/v1/tags", { cursor, limit: 100 }), tagPageSchema);
}

export function getTag(tagId: string) {
  return requestTaskJson(`/api/v1/tags/${tagId}`, tagDtoSchema);
}

export function createTag(resourceId: string, input: CreateTagRequest) {
  return requestTaskJson(
    "/api/v1/tags",
    tagDtoSchema,
    taskJsonMutation("POST", createTagRequestSchema.parse(input), { "idempotency-key": resourceId }),
  );
}

export function updateTag(tagId: string, input: UpdateTagRequest) {
  return requestTaskJson(
    `/api/v1/tags/${tagId}`,
    tagDtoSchema,
    taskJsonMutation("PATCH", updateTagRequestSchema.parse(input)),
  );
}

export function deleteTag(tagId: string, expectedVersion: number) {
  return requestTaskJson(
    `/api/v1/tags/${tagId}/delete`,
    tagDtoSchema,
    taskJsonMutation("POST", deleteTagRequestSchema.parse({ expectedVersion })),
  );
}

export function restoreTag(tagId: string, expectedVersion: number) {
  return requestTaskJson(
    `/api/v1/tags/${tagId}/restore`,
    tagDtoSchema,
    taskJsonMutation("POST", restoreTagRequestSchema.parse({ expectedVersion })),
  );
}
