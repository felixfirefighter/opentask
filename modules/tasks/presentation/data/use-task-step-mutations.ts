"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  ChecklistItemDto,
  TaskDetailDto,
  TaskDto,
  UpdateChecklistItemRequest,
} from "../../application/contracts";
import {
  createChecklistItem,
  createTask,
  deleteChecklistItem,
  positionChecklistItem,
  positionTask,
  updateChecklistItem,
} from "./task-api-client";
import { taskQueryKeys } from "./task-query-keys";

type CreateSubtaskVariables = Readonly<{
  parent: TaskDetailDto;
  resourceId: string;
  title: string;
}>;

export function useCreateSubtaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ parent, resourceId, title }: CreateSubtaskVariables) =>
      createTask(resourceId, {
        title,
        descriptionMd: "",
        priority: "none",
        listId: parent.listId,
        sectionId: parent.sectionId,
        parentTaskId: parent.id,
        placement: { kind: "end" },
      }),
    onMutate: async ({ parent, resourceId, title }) => {
      const key = taskQueryKeys.detail(parent.id);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TaskDetailDto>(key);
      const now = new Date().toISOString();
      const optimistic: TaskDto = {
        id: resourceId,
        version: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        listId: parent.listId,
        sectionId: parent.sectionId,
        parentTaskId: parent.id,
        title,
        descriptionMd: "",
        status: "open",
        priority: "none",
        rank: "z0",
        statusChangedAt: now,
      };
      queryClient.setQueryData<TaskDetailDto>(key, (detail) =>
        detail
          ? {
              ...detail,
              subtasks: [...detail.subtasks.filter((subtask) => subtask.id !== resourceId), optimistic],
            }
          : detail,
      );
      return { key, previous };
    },
    onError: (_error, _variables, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
    },
    onSuccess: (created, { parent }) => {
      queryClient.setQueryData<TaskDetailDto>(taskQueryKeys.detail(parent.id), (detail) =>
        detail
          ? {
              ...detail,
              subtasks: [...detail.subtasks.filter((subtask) => subtask.id !== created.id), created],
            }
          : detail,
      );
    },
    onSettled: (_value, _error, { parent }) => {
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.detail(parent.id) }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.list(parent.listId) }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.searchRoot() }),
      ]);
    },
  });
}

type ChecklistCreateVariables = Readonly<{ taskId: string; resourceId: string; title: string }>;
type ChecklistUpdateVariables = Readonly<{
  taskId: string;
  item: ChecklistItemDto;
  patch: UpdateChecklistItemRequest["patch"];
}>;
type StepPlacement = Readonly<{ kind: "before" | "after"; anchorId: string }>;
type SubtaskPositionVariables = Readonly<{
  parentTaskId: string;
  subtask: TaskDto;
  overTaskId: string;
  placement: StepPlacement;
}>;
type ChecklistPositionVariables = Readonly<{
  taskId: string;
  item: ChecklistItemDto;
  overItemId: string;
  placement: StepPlacement;
}>;

export function usePositionSubtaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ subtask, placement }: SubtaskPositionVariables) =>
      positionTask(subtask.id, { expectedVersion: subtask.version, placement }),
    onMutate: async ({ parentTaskId, subtask, overTaskId }) => {
      const key = taskQueryKeys.detail(parentTaskId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TaskDetailDto>(key);
      queryClient.setQueryData<TaskDetailDto>(key, (detail) =>
        detail ? { ...detail, subtasks: reorderRows(detail.subtasks, subtask.id, overTaskId) } : detail,
      );
      return { key, previous };
    },
    onError: (_error, _variables, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
    },
    onSuccess: (updated, { parentTaskId }) => {
      queryClient.setQueryData<TaskDetailDto>(taskQueryKeys.detail(parentTaskId), (detail) =>
        detail
          ? {
              ...detail,
              subtasks: detail.subtasks.map((subtask) => (subtask.id === updated.id ? updated : subtask)),
            }
          : detail,
      );
    },
    onSettled: (_value, _error, { parentTaskId, subtask }) => {
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.detail(parentTaskId) }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.detail(subtask.id) }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.searchRoot() }),
      ]);
    },
  });
}

export function useCreateChecklistItemMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, resourceId, title }: ChecklistCreateVariables) =>
      createChecklistItem(taskId, resourceId, { title, placement: { kind: "end" } }),
    onSuccess: (item, { taskId }) => {
      queryClient.setQueryData<TaskDetailDto>(taskQueryKeys.detail(taskId), (detail) =>
        detail
          ? {
              ...detail,
              checklistItems: [
                ...detail.checklistItems.filter((checklistItem) => checklistItem.id !== item.id),
                item,
              ],
            }
          : detail,
      );
    },
    onSettled: (_value, _error, { taskId }) => {
      return queryClient.invalidateQueries({ queryKey: taskQueryKeys.detail(taskId) });
    },
  });
}

export function useUpdateChecklistItemMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, item, patch }: ChecklistUpdateVariables) =>
      updateChecklistItem(taskId, item.id, { expectedVersion: item.version, patch }),
    onMutate: async ({ taskId, item, patch }) => {
      const key = taskQueryKeys.detail(taskId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TaskDetailDto>(key);
      queryClient.setQueryData<TaskDetailDto>(key, (detail) =>
        detail
          ? {
              ...detail,
              checklistItems: detail.checklistItems.map((row) =>
                row.id === item.id
                  ? {
                      ...row,
                      title: patch.title ?? row.title,
                      isCompleted: patch.isCompleted ?? row.isCompleted,
                    }
                  : row,
              ),
            }
          : detail,
      );
      return { key, previous };
    },
    onError: (_error, _variables, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
    },
    onSuccess: (updated, { taskId }) => replaceChecklistItem(queryClient, taskId, updated),
    onSettled: (_value, _error, { taskId }) => {
      return queryClient.invalidateQueries({ queryKey: taskQueryKeys.detail(taskId) });
    },
  });
}

export function usePositionChecklistItemMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, item, placement }: ChecklistPositionVariables) =>
      positionChecklistItem(taskId, item.id, {
        expectedVersion: item.version,
        placement,
      }),
    onMutate: async ({ taskId, item, overItemId }) => {
      const key = taskQueryKeys.detail(taskId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TaskDetailDto>(key);
      queryClient.setQueryData<TaskDetailDto>(key, (detail) =>
        detail
          ? { ...detail, checklistItems: reorderRows(detail.checklistItems, item.id, overItemId) }
          : detail,
      );
      return { key, previous };
    },
    onError: (_error, _variables, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
    },
    onSuccess: (updated, { taskId }) => replaceChecklistItem(queryClient, taskId, updated),
    onSettled: (_value, _error, { taskId }) => {
      return queryClient.invalidateQueries({ queryKey: taskQueryKeys.detail(taskId) });
    },
  });
}

export function useDeleteChecklistItemMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, item }: { taskId: string; item: ChecklistItemDto }) =>
      deleteChecklistItem(taskId, item.id, item.version),
    onSuccess: (deleted, { taskId }) => {
      queryClient.setQueryData<TaskDetailDto>(taskQueryKeys.detail(taskId), (detail) =>
        detail
          ? { ...detail, checklistItems: detail.checklistItems.filter((row) => row.id !== deleted.id) }
          : detail,
      );
    },
    onSettled: (_value, _error, { taskId }) => {
      return queryClient.invalidateQueries({ queryKey: taskQueryKeys.detail(taskId) });
    },
  });
}

function replaceChecklistItem(
  queryClient: ReturnType<typeof useQueryClient>,
  taskId: string,
  updated: ChecklistItemDto,
) {
  queryClient.setQueryData<TaskDetailDto>(taskQueryKeys.detail(taskId), (detail) =>
    detail
      ? {
          ...detail,
          checklistItems: detail.checklistItems.map((item) => (item.id === updated.id ? updated : item)),
        }
      : detail,
  );
}

function reorderRows<Row extends { id: string }>(rows: readonly Row[], activeId: string, overId: string) {
  const from = rows.findIndex((row) => row.id === activeId);
  const to = rows.findIndex((row) => row.id === overId);
  if (from < 0 || to < 0 || from === to) return [...rows];
  const next = [...rows];
  const [active] = next.splice(from, 1);
  if (!active) return [...rows];
  next.splice(to, 0, active);
  return next;
}
