"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { markWorkspaceRoutesStale } from "@/shared/presentation";

import type { TaskDetailDto, TaskScheduleValue } from "../../application/contracts";
import type { RecurrenceDefinition } from "../../application/contracts/recurrence-contract";
import { classifyTaskWriteOutcome } from "../task-write-outcome";
import { patchTask, type TaskPageCache } from "./task-cache";
import {
  editRecurringTaskSchedule,
  endTaskRecurrence,
  getTaskRecurrence,
  setTaskRecurrence,
} from "./task-recurrence-api-client";
import { taskQueryKeys } from "./task-query-keys";

export const taskRecurrenceQueryKey = (taskId: string) => ["tasks", "recurrence", taskId] as const;

export type TaskRecurrenceMutationInput =
  | Readonly<{
      kind: "definition";
      task: TaskDetailDto;
      expectedVersion: number;
      definition: RecurrenceDefinition;
    }>
  | Readonly<{
      kind: "schedule";
      task: TaskDetailDto;
      expectedVersion: number;
      definition: RecurrenceDefinition;
      schedule: TaskScheduleValue;
    }>
  | Readonly<{
      kind: "end";
      task: TaskDetailDto;
      expectedVersion: number;
    }>;

export function useTaskRecurrenceQuery(taskId: string, enabled = true) {
  return useQuery({
    queryKey: taskRecurrenceQueryKey(taskId),
    queryFn: () => getTaskRecurrence(taskId),
    enabled,
  });
}

export function useTaskRecurrenceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskRecurrenceMutationInput) => {
      if (input.kind === "end") {
        return endTaskRecurrence(input.task.id, { expectedVersion: input.expectedVersion });
      }
      if (input.kind === "schedule") {
        return editRecurringTaskSchedule(input.task.id, {
          expectedVersion: input.expectedVersion,
          definition: input.definition,
          schedule: input.schedule,
        });
      }
      return setTaskRecurrence(input.task.id, {
        expectedVersion: input.expectedVersion,
        definition: input.definition,
      });
    },
    onError: (error) => {
      if (classifyTaskWriteOutcome(error) === "unconfirmed") markWorkspaceRoutesStale();
    },
    onSuccess: (result, input) => {
      const { task } = input;
      queryClient.setQueryData(taskRecurrenceQueryKey(task.id), result.recurrence);
      if (input.kind === "schedule") {
        queryClient.setQueryData(taskQueryKeys.schedule(task.id), input.schedule);
      }
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
    onSettled: (_result, _error, input) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: taskRecurrenceQueryKey(input.task.id) }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.schedule(input.task.id) }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.detail(input.task.id) }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.list(input.task.listId) }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.terminalRoot() }),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.searchRoot() }),
      ]),
  });
}
