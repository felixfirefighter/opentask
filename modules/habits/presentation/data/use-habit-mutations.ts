"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { markWorkspaceRoutesStale } from "@/shared/presentation";

import type {
  CreateHabitRequest,
  EditHabitDayRequest,
  HabitScheduleValue,
  RecordHabitDayRequest,
  UndoHabitDayRequest,
  UpdateHabitRequest,
} from "../../application/contracts";
import {
  archiveHabit,
  createHabit,
  editHabitDay,
  recordHabitDay,
  restoreHabit,
  setHabitSchedule,
  undoHabitDay,
  updateHabit,
} from "./habit-api-client";
import { isHabitApiError } from "./habit-api-request";
import { habitQueryKeys } from "./habit-query-keys";

export function useCreateHabitMutation() {
  return useHabitMutation(
    ({ resourceId, input }: Readonly<{ resourceId: string; input: CreateHabitRequest }>) =>
      createHabit(resourceId, input),
  );
}

export function useUpdateHabitMutation() {
  return useHabitMutation(({ habitId, input }: Readonly<{ habitId: string; input: UpdateHabitRequest }>) =>
    updateHabit(habitId, input),
  );
}

export function useSetHabitScheduleMutation() {
  return useHabitMutation(
    ({
      habitId,
      expectedVersion,
      schedule,
    }: Readonly<{
      habitId: string;
      expectedVersion: number;
      schedule: HabitScheduleValue;
    }>) => setHabitSchedule(habitId, expectedVersion, schedule),
  );
}

export function useHabitLifecycleMutation() {
  return useHabitMutation(
    ({
      action,
      habitId,
      expectedVersion,
    }: Readonly<{
      action: "archive" | "restore";
      habitId: string;
      expectedVersion: number;
    }>) =>
      action === "archive" ? archiveHabit(habitId, expectedVersion) : restoreHabit(habitId, expectedVersion),
  );
}

export function useRecordHabitDayMutation() {
  return useHabitMutation(
    ({
      habitId,
      resourceId,
      input,
    }: Readonly<{
      habitId: string;
      resourceId: string;
      input: RecordHabitDayRequest;
    }>) => recordHabitDay(habitId, resourceId, input),
  );
}

export function useEditHabitDayMutation() {
  return useHabitMutation(
    ({
      habitId,
      localDate,
      input,
    }: Readonly<{
      habitId: string;
      localDate: string;
      input: EditHabitDayRequest;
    }>) => editHabitDay(habitId, localDate, input),
  );
}

export function useUndoHabitDayMutation() {
  return useHabitMutation(
    ({
      habitId,
      localDate,
      input,
    }: Readonly<{
      habitId: string;
      localDate: string;
      input: UndoHabitDayRequest;
    }>) => undoHabitDay(habitId, localDate, input),
  );
}

function useHabitMutation<TData, TVariables>(mutationFn: (variables: TVariables) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onError: (error) => {
      if (!isHabitApiError(error) || error.code === "INTERNAL") markWorkspaceRoutesStale();
    },
    onSuccess: () => {
      markWorkspaceRoutesStale();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: habitQueryKeys.all }),
  });
}
