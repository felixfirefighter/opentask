"use client";

import { useQueryClient } from "@tanstack/react-query";

import type { TaskDetailDto, TaskScheduleValue } from "../../application/contracts";
import { useTaskScheduleMutation } from "./use-task-schedule";
import {
  taskRecurrenceQueryKey,
  useTaskRecurrenceMutation,
  useTaskRecurrenceQuery,
} from "./use-task-recurrence";

export type RoutedTaskScheduleMutationInput = Readonly<{
  task: TaskDetailDto;
  expectedVersion: number;
  schedule: TaskScheduleValue | null;
}>;

export function useTaskScheduleWriteRouter(task: TaskDetailDto) {
  const queryClient = useQueryClient();
  const recurrenceQuery = useTaskRecurrenceQuery(task.id, task.parentTaskId === null);
  const scheduleMutation = useTaskScheduleMutation();
  const recurrenceMutation = useTaskRecurrenceMutation();
  const recurrence = recurrenceQuery.data ?? null;

  async function mutateAsync(input: RoutedTaskScheduleMutationInput) {
    if (input.schedule !== null && recurrence !== null) {
      return recurrenceMutation.mutateAsync({
        kind: "schedule",
        task: input.task,
        expectedVersion: input.expectedVersion,
        definition: recurrence.definition,
        schedule: input.schedule,
      });
    }
    const result = await scheduleMutation.mutateAsync(input);
    if (input.schedule === null && recurrence?.lifecycle === "ended") {
      queryClient.setQueryData(taskRecurrenceQueryKey(task.id), null);
      await queryClient.invalidateQueries({ queryKey: taskRecurrenceQueryKey(task.id) });
    }
    return result;
  }

  return {
    error: recurrenceMutation.error ?? scheduleMutation.error,
    isError: recurrenceMutation.isError || scheduleMutation.isError,
    isPending: recurrenceMutation.isPending || scheduleMutation.isPending,
    mutateAsync,
    recurrence,
    recurrenceQuery,
    reset() {
      recurrenceMutation.reset();
      scheduleMutation.reset();
    },
  } as const;
}
