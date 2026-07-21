"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { markWorkspaceRoutesStale } from "@/shared/presentation";

import type {
  CreateTaskRequest,
  CreateTaskWithScheduleRequest,
  TaskDetailDto,
  TaskListItemDto,
  UpdateTaskRequest,
} from "../../application/contracts";
import { createTask, createTaskWithSchedule, updateTask } from "./task-api-client";
import { classifyTaskWriteOutcome } from "../task-write-outcome";
import {
  optimisticTask,
  patchTask,
  prependTask,
  replaceTask,
  taskListItem,
  type TaskPageCache,
} from "./task-cache";
import { taskQueryKeys } from "./task-query-keys";

type CreateTaskVariables = Readonly<{
  resourceId: string;
  input: CreateTaskRequest;
}>;

type UpdateTaskVariables = Readonly<{
  taskId: string;
  listId: string;
  input: UpdateTaskRequest;
}>;

type CreateTaskWithScheduleVariables = Readonly<{
  resourceId: string;
  input: CreateTaskWithScheduleRequest;
}>;

export function useCreateTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ resourceId, input }: CreateTaskVariables) => createTask(resourceId, input),
    onMutate: async ({ resourceId, input }) => {
      const key = taskQueryKeys.list(input.listId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TaskPageCache>(key);
      queryClient.setQueryData<TaskPageCache>(key, (cache) =>
        prependTask(cache, optimisticTask(resourceId, input)),
      );
      return { key, previous };
    },
    onError: (error, _variables, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
      if (classifyTaskWriteOutcome(error) === "unconfirmed") markWorkspaceRoutesStale();
    },
    onSuccess: (created, { input }) => {
      const key = taskQueryKeys.list(input.listId);
      queryClient.setQueryData<TaskPageCache>(key, (cache) => replaceTask(cache, taskListItem(created)));
      markWorkspaceRoutesStale();
    },
    onSettled: (_value, _error, { input }) => {
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.list(input.listId) }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.searchRoot() }),
      ]);
    },
  });
}

export function useCreateTaskWithScheduleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ resourceId, input }: CreateTaskWithScheduleVariables) =>
      createTaskWithSchedule(resourceId, input),
    onMutate: async ({ resourceId, input }) => {
      const key = taskQueryKeys.list(input.listId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TaskPageCache>(key);
      queryClient.setQueryData<TaskPageCache>(key, (cache) =>
        prependTask(cache, optimisticTask(resourceId, input)),
      );
      return { key, previous };
    },
    onError: (error, _variables, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
      if (classifyTaskWriteOutcome(error) === "unconfirmed") markWorkspaceRoutesStale();
    },
    onSuccess: (created, { input }) => {
      const key = taskQueryKeys.list(input.listId);
      queryClient.setQueryData<TaskPageCache>(key, (cache) => replaceTask(cache, taskListItem(created.task)));
      markWorkspaceRoutesStale();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: taskQueryKeys.all }),
  });
}

export function useUpdateTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, input }: UpdateTaskVariables) => updateTask(taskId, input),
    onMutate: async ({ taskId, listId, input }) => {
      const listKey = taskQueryKeys.list(listId);
      const detailKey = taskQueryKeys.detail(taskId);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: listKey }),
        queryClient.cancelQueries({ queryKey: detailKey }),
      ]);
      const previousList = queryClient.getQueryData<TaskPageCache>(listKey);
      const previousDetail = queryClient.getQueryData<TaskDetailDto>(detailKey);
      queryClient.setQueryData<TaskPageCache>(listKey, (cache) =>
        patchTask(cache, taskId, (task) => applyTaskPatch(task, input.patch)),
      );
      queryClient.setQueryData<TaskDetailDto>(detailKey, (task) =>
        task ? applyTaskPatch(task, input.patch) : task,
      );
      return { listKey, detailKey, previousList, previousDetail };
    },
    onError: (error, _variables, context) => {
      if (context) {
        queryClient.setQueryData(context.listKey, context.previousList);
        queryClient.setQueryData(context.detailKey, context.previousDetail);
      }
      if (classifyTaskWriteOutcome(error) === "unconfirmed") markWorkspaceRoutesStale();
    },
    onSuccess: (updated, { taskId, listId }) => {
      queryClient.setQueryData<TaskPageCache>(taskQueryKeys.list(listId), (cache) =>
        patchTask(cache, taskId, (task) => taskListItem(updated, task.tags)),
      );
      queryClient.setQueryData<TaskDetailDto>(taskQueryKeys.detail(taskId), (task) =>
        task ? { ...task, ...updated } : task,
      );
      markWorkspaceRoutesStale();
    },
    onSettled: (_value, _error, { taskId, listId }) => {
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.list(listId) }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.terminalRoot() }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.detail(taskId) }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.searchRoot() }),
      ]);
    },
  });
}

export type EditableTask = TaskListItemDto | TaskDetailDto;

function applyTaskPatch<T extends EditableTask>(task: T, patch: UpdateTaskRequest["patch"]): T {
  return {
    ...task,
    title: patch.title ?? task.title,
    descriptionMd: patch.descriptionMd ?? task.descriptionMd,
    priority: patch.priority ?? task.priority,
  };
}
