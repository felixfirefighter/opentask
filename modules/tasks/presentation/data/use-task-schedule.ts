"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { markWorkspaceRoutesStale } from "@/shared/presentation";

import type { TaskDetailDto, TaskScheduleValue } from "../../application/contracts";
import { patchTask, type TaskPageCache } from "./task-cache";
import {
  clearTaskSchedule,
  getSchedulePreferences,
  getTaskSchedule,
  setTaskSchedule,
} from "./task-schedule-api-client";
import { taskQueryKeys } from "./task-query-keys";
import { classifyTaskWriteOutcome } from "../task-write-outcome";

export type TaskScheduleMutationInput = Readonly<{
  task: TaskDetailDto;
  expectedVersion: number;
  schedule: TaskScheduleValue | null;
}>;

export function useTaskScheduleQuery(taskId: string) {
  return useQuery({
    queryKey: taskQueryKeys.schedule(taskId),
    queryFn: () => getTaskSchedule(taskId),
  });
}

export function useSchedulePreferencesQuery() {
  return useQuery({
    queryKey: taskQueryKeys.schedulePreferences(),
    queryFn: getSchedulePreferences,
  });
}

export function useTaskScheduleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ expectedVersion, schedule, task }: TaskScheduleMutationInput) =>
      schedule === null
        ? clearTaskSchedule(task.id, { expectedVersion })
        : setTaskSchedule(task.id, { expectedVersion, schedule }),
    onError: (error) => {
      if (classifyTaskWriteOutcome(error) === "unconfirmed") markWorkspaceRoutesStale();
    },
    onSuccess: (result, { task }) => {
      queryClient.setQueryData(taskQueryKeys.schedule(task.id), result.schedule);
      queryClient.setQueryData<TaskDetailDto>(taskQueryKeys.detail(task.id), (current) =>
        current ? { ...current, version: result.task.version } : current,
      );
      queryClient.setQueryData<TaskPageCache>(taskQueryKeys.list(task.listId), (current) =>
        patchTask(current, task.id, (row) => ({ ...row, version: result.task.version })),
      );
      if (task.parentTaskId) {
        queryClient.setQueryData<TaskDetailDto>(taskQueryKeys.detail(task.parentTaskId), (parent) =>
          parent
            ? {
                ...parent,
                subtasks: parent.subtasks.map((subtask) =>
                  subtask.id === task.id ? { ...subtask, version: result.task.version } : subtask,
                ),
              }
            : parent,
        );
      }
      markWorkspaceRoutesStale();
    },
    onSettled: (_result, _error, { task }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.schedule(task.id) }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.detail(task.id) }),
        ...(task.parentTaskId
          ? [queryClient.invalidateQueries({ queryKey: taskQueryKeys.detail(task.parentTaskId) })]
          : []),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.list(task.listId) }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.terminalRoot() }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.searchRoot() }),
      ]),
  });
}
