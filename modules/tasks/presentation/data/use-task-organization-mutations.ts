"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  MoveTaskRequest,
  PositionTaskRequest,
  TagDto,
  TaskDetailDto,
  TaskListItemDto,
} from "../../application/contracts";
import { moveTask, positionTask, replaceTaskTags } from "./task-api-client";
import {
  moveTaskInCache,
  patchTask,
  prependTask,
  removeTask,
  taskListItem,
  type TaskPageCache,
} from "./task-cache";
import { taskQueryKeys } from "./task-query-keys";

type MoveVariables = Readonly<{
  task: TaskListItemDto | TaskDetailDto;
  input: MoveTaskRequest;
}>;

type ReorderVariables = Readonly<{
  task: TaskListItemDto | TaskDetailDto;
  overTaskId: string;
  input: PositionTaskRequest;
}>;

type ReplaceTagsVariables = Readonly<{
  task: TaskListItemDto | TaskDetailDto;
  tags: TagDto[];
}>;

export function useMoveTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ task, input }: MoveVariables) => moveTask(task.id, input),
    onMutate: async ({ task, input }) => {
      const sourceKey = taskQueryKeys.list(task.listId);
      const destinationKey = taskQueryKeys.list(input.listId);
      const detailKey = taskQueryKeys.detail(task.id);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: sourceKey }),
        queryClient.cancelQueries({ queryKey: destinationKey }),
        queryClient.cancelQueries({ queryKey: detailKey }),
      ]);
      const previousSource = queryClient.getQueryData<TaskPageCache>(sourceKey);
      const previousDestination = queryClient.getQueryData<TaskPageCache>(destinationKey);
      const previousDetail = queryClient.getQueryData<TaskDetailDto>(detailKey);
      const moved = taskListItem(
        { ...task, listId: input.listId, sectionId: input.sectionId, parentTaskId: input.parentTaskId },
        task.tags,
      );

      if (task.listId === input.listId) {
        queryClient.setQueryData<TaskPageCache>(sourceKey, (cache) => patchTask(cache, task.id, () => moved));
      } else {
        queryClient.setQueryData<TaskPageCache>(sourceKey, (cache) => removeTask(cache, task.id));
        queryClient.setQueryData<TaskPageCache>(destinationKey, (cache) => prependTask(cache, moved));
      }
      queryClient.setQueryData<TaskDetailDto>(detailKey, (detail) =>
        detail
          ? {
              ...detail,
              listId: input.listId,
              sectionId: input.sectionId,
              parentTaskId: input.parentTaskId,
            }
          : detail,
      );
      return { sourceKey, destinationKey, detailKey, previousSource, previousDestination, previousDetail };
    },
    onError: (_error, _variables, context) => {
      if (!context) return;
      queryClient.setQueryData(context.sourceKey, context.previousSource);
      queryClient.setQueryData(context.destinationKey, context.previousDestination);
      queryClient.setQueryData(context.detailKey, context.previousDetail);
    },
    onSuccess: (updated, { task, input }) => {
      const destinationKey = taskQueryKeys.list(input.listId);
      queryClient.setQueryData<TaskPageCache>(destinationKey, (cache) =>
        patchTask(cache, task.id, (row) => taskListItem(updated, row.tags)),
      );
      queryClient.setQueryData<TaskDetailDto>(taskQueryKeys.detail(task.id), (detail) =>
        detail ? { ...detail, ...updated } : detail,
      );
    },
    onSettled: (_value, _error, { task, input }) => {
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.list(task.listId) }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.list(input.listId) }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.terminalRoot() }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.detailRoot() }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.searchRoot() }),
      ]);
    },
  });
}

export function useReorderTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ task, input }: ReorderVariables) => positionTask(task.id, input),
    onMutate: async ({ task, overTaskId }) => {
      const key = taskQueryKeys.list(task.listId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TaskPageCache>(key);
      queryClient.setQueryData<TaskPageCache>(key, (cache) => moveTaskInCache(cache, task.id, overTaskId));
      return { key, previous };
    },
    onError: (_error, _variables, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
    },
    onSuccess: (updated, { task }) => {
      queryClient.setQueryData<TaskPageCache>(taskQueryKeys.list(task.listId), (cache) =>
        patchTask(cache, task.id, (row) => taskListItem(updated, row.tags)),
      );
      queryClient.setQueryData<TaskDetailDto>(taskQueryKeys.detail(task.id), (detail) =>
        detail ? { ...detail, ...updated } : detail,
      );
    },
    onSettled: (_value, _error, { task }) => {
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.list(task.listId) }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.detail(task.id) }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.searchRoot() }),
      ]);
    },
  });
}

export function useReplaceTaskTagsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ task, tags }: ReplaceTagsVariables) =>
      replaceTaskTags(task.id, { expectedVersion: task.version, tagIds: tags.map((tag) => tag.id) }),
    onMutate: async ({ task, tags }) => {
      const listKey = taskQueryKeys.list(task.listId);
      const detailKey = taskQueryKeys.detail(task.id);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: listKey }),
        queryClient.cancelQueries({ queryKey: detailKey }),
      ]);
      const previousList = queryClient.getQueryData<TaskPageCache>(listKey);
      const previousDetail = queryClient.getQueryData<TaskDetailDto>(detailKey);
      queryClient.setQueryData<TaskPageCache>(listKey, (cache) =>
        patchTask(cache, task.id, (row) => ({ ...row, tags })),
      );
      queryClient.setQueryData<TaskDetailDto>(detailKey, (detail) => (detail ? { ...detail, tags } : detail));
      return { listKey, detailKey, previousList, previousDetail };
    },
    onError: (_error, _variables, context) => {
      if (!context) return;
      queryClient.setQueryData(context.listKey, context.previousList);
      queryClient.setQueryData(context.detailKey, context.previousDetail);
    },
    onSuccess: (result, { task }) => {
      queryClient.setQueryData<TaskPageCache>(taskQueryKeys.list(task.listId), (cache) =>
        patchTask(cache, task.id, (row) => ({ ...row, version: result.task.version, tags: result.tags })),
      );
      queryClient.setQueryData<TaskDetailDto>(taskQueryKeys.detail(task.id), (detail) =>
        detail ? { ...detail, version: result.task.version, tags: result.tags } : detail,
      );
    },
    onSettled: (_value, _error, { task }) => {
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.list(task.listId) }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.terminalRoot() }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.detail(task.id) }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.tags() }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.searchRoot() }),
      ]);
    },
  });
}
