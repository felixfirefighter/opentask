import {
  createFolderRequestSchema,
  createRegularListRequestSchema,
  createSectionRequestSchema,
  deleteFolderRequestSchema,
  deleteRegularListRequestSchema,
  deleteSectionRequestSchema,
  folderDtoSchema,
  folderPageSchema,
  moveRegularListRequestSchema,
  positionFolderRequestSchema,
  positionSectionRequestSchema,
  regularListDtoSchema,
  regularListPageSchema,
  restoreFolderRequestSchema,
  restoreRegularListRequestSchema,
  sectionDtoSchema,
  sectionPageSchema,
  updateFolderRequestSchema,
  updateRegularListRequestSchema,
  updateSectionRequestSchema,
  type CreateFolderRequest,
  type CreateRegularListRequest,
  type CreateSectionRequest,
  type DeleteRegularListRequest,
  type MoveRegularListRequest,
  type PositionFolderRequest,
  type PositionSectionRequest,
  type UpdateFolderRequest,
  type UpdateRegularListRequest,
  type UpdateSectionRequest,
} from "../../application/contracts";
import { requestTaskJson, taskJsonMutation, taskQueryPath } from "./task-api-request";

export function listFolders(cursor?: string) {
  return requestTaskJson(taskQueryPath("/api/v1/folders", { cursor, limit: 100 }), folderPageSchema);
}

export function getFolder(folderId: string) {
  return requestTaskJson(`/api/v1/folders/${folderId}`, folderDtoSchema);
}

export function createFolder(resourceId: string, input: CreateFolderRequest) {
  return requestTaskJson(
    "/api/v1/folders",
    folderDtoSchema,
    taskJsonMutation("POST", createFolderRequestSchema.parse(input), { "idempotency-key": resourceId }),
  );
}

export function updateFolder(folderId: string, input: UpdateFolderRequest) {
  return requestTaskJson(
    `/api/v1/folders/${folderId}`,
    folderDtoSchema,
    taskJsonMutation("PATCH", updateFolderRequestSchema.parse(input)),
  );
}

export function positionFolder(folderId: string, input: PositionFolderRequest) {
  return requestTaskJson(
    `/api/v1/folders/${folderId}/position`,
    folderDtoSchema,
    taskJsonMutation("POST", positionFolderRequestSchema.parse(input)),
  );
}

export function deleteFolder(folderId: string, expectedVersion: number) {
  return requestTaskJson(
    `/api/v1/folders/${folderId}/delete`,
    folderDtoSchema,
    taskJsonMutation("POST", deleteFolderRequestSchema.parse({ expectedVersion })),
  );
}

export function restoreFolder(folderId: string, expectedVersion: number) {
  return requestTaskJson(
    `/api/v1/folders/${folderId}/restore`,
    folderDtoSchema,
    taskJsonMutation("POST", restoreFolderRequestSchema.parse({ expectedVersion })),
  );
}

export function listRegularLists(cursor?: string) {
  return requestTaskJson(taskQueryPath("/api/v1/lists", { cursor, limit: 100 }), regularListPageSchema);
}

export function getRegularList(listId: string) {
  return requestTaskJson(`/api/v1/lists/${listId}`, regularListDtoSchema);
}

export function createRegularList(resourceId: string, input: CreateRegularListRequest) {
  return requestTaskJson(
    "/api/v1/lists",
    regularListDtoSchema,
    taskJsonMutation("POST", createRegularListRequestSchema.parse(input), {
      "idempotency-key": resourceId,
    }),
  );
}

export function updateRegularList(listId: string, input: UpdateRegularListRequest) {
  return requestTaskJson(
    `/api/v1/lists/${listId}`,
    regularListDtoSchema,
    taskJsonMutation("PATCH", updateRegularListRequestSchema.parse(input)),
  );
}

export function moveRegularList(listId: string, input: MoveRegularListRequest) {
  return requestTaskJson(
    `/api/v1/lists/${listId}/move`,
    regularListDtoSchema,
    taskJsonMutation("POST", moveRegularListRequestSchema.parse(input)),
  );
}

export function deleteRegularList(listId: string, input: DeleteRegularListRequest) {
  return requestTaskJson(
    `/api/v1/lists/${listId}/delete`,
    regularListDtoSchema,
    taskJsonMutation("POST", deleteRegularListRequestSchema.parse(input)),
  );
}

export function restoreRegularList(listId: string, expectedVersion: number) {
  return requestTaskJson(
    `/api/v1/lists/${listId}/restore`,
    regularListDtoSchema,
    taskJsonMutation("POST", restoreRegularListRequestSchema.parse({ expectedVersion })),
  );
}

export function listSections(listId: string, cursor?: string) {
  return requestTaskJson(
    taskQueryPath(`/api/v1/lists/${listId}/sections`, { cursor, limit: 100 }),
    sectionPageSchema,
  );
}

export function createSection(listId: string, resourceId: string, input: CreateSectionRequest) {
  return requestTaskJson(
    `/api/v1/lists/${listId}/sections`,
    sectionDtoSchema,
    taskJsonMutation("POST", createSectionRequestSchema.parse(input), {
      "idempotency-key": resourceId,
    }),
  );
}

export function updateSection(listId: string, sectionId: string, input: UpdateSectionRequest) {
  return requestTaskJson(
    `/api/v1/lists/${listId}/sections/${sectionId}`,
    sectionDtoSchema,
    taskJsonMutation("PATCH", updateSectionRequestSchema.parse(input)),
  );
}

export function positionSection(listId: string, sectionId: string, input: PositionSectionRequest) {
  return requestTaskJson(
    `/api/v1/lists/${listId}/sections/${sectionId}/position`,
    sectionDtoSchema,
    taskJsonMutation("POST", positionSectionRequestSchema.parse(input)),
  );
}

export function deleteSection(listId: string, sectionId: string, expectedVersion: number) {
  return requestTaskJson(
    `/api/v1/lists/${listId}/sections/${sectionId}/delete`,
    sectionDtoSchema,
    taskJsonMutation("POST", deleteSectionRequestSchema.parse({ expectedVersion })),
  );
}
