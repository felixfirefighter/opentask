"use client";

import { useQuery } from "@tanstack/react-query";

import { getPushCapability, getTaskReminder } from "./notification-api-client";
import { notificationQueryKeys } from "./notification-query-keys";

export function usePushCapabilityQuery() {
  return useQuery({ queryKey: notificationQueryKeys.capability, queryFn: getPushCapability });
}

export function useTaskReminderQuery(taskId: string) {
  return useQuery({
    queryKey: notificationQueryKeys.reminder(taskId),
    queryFn: () => getTaskReminder(taskId),
  });
}
