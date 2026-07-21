"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { notificationQueryKeys } from "./notification-query-keys";

export type BrowserPushEnrollment = "enrolled" | "reset_required" | "unverified";

export function useBrowserPushEnrollment() {
  return useQuery({
    queryKey: notificationQueryKeys.browserEnrollment,
    queryFn: () => Promise.resolve("unverified" as const),
    initialData: "unverified" as BrowserPushEnrollment,
    staleTime: Number.POSITIVE_INFINITY,
  }).data;
}

export function useSetBrowserPushEnrollment() {
  const queryClient = useQueryClient();
  return (enrollment: BrowserPushEnrollment) =>
    queryClient.setQueryData(notificationQueryKeys.browserEnrollment, enrollment);
}
