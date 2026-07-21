"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  RegisterPushSubscriptionInput,
  RevokePushSubscriptionInput,
  SetTaskReminderRequest,
  TaskReminderDto,
} from "../../application/contracts";
import {
  registerPushSubscription,
  removeTaskReminder,
  revokePushSubscription,
  setTaskReminder,
} from "./notification-api-client";
import { notificationQueryKeys } from "./notification-query-keys";

export function useSetTaskReminderMutation(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetTaskReminderRequest) => setTaskReminder(taskId, input),
    onSuccess: (reminder) =>
      queryClient.setQueryData<TaskReminderDto>(notificationQueryKeys.reminder(taskId), reminder),
  });
}

export function useRemoveTaskReminderMutation(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expectedVersion: number) => removeTaskReminder(taskId, expectedVersion),
    onSuccess: () => queryClient.setQueryData(notificationQueryKeys.reminder(taskId), null),
  });
}

export function useRegisterPushSubscriptionMutation() {
  return useMutation({
    mutationFn: (input: RegisterPushSubscriptionInput) => registerPushSubscription(input),
  });
}

export function useRevokePushSubscriptionMutation() {
  return useMutation({
    mutationFn: (input: RevokePushSubscriptionInput) => revokePushSubscription(input),
  });
}
