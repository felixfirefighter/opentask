"use client";

import { useCallback, type ReactNode } from "react";

import { useTaskReminderQuery } from "./data/use-notification-queries";

type RecurrenceReminderReview = Readonly<{
  status: "loading" | "ready" | "unavailable";
  absoluteReminderVersion: number | null;
  refresh: () => Promise<void>;
}>;

export type TaskRecurrenceReminderSourceProps = Readonly<{
  taskId: string;
  children: (review: RecurrenceReminderReview) => ReactNode;
}>;

export function TaskRecurrenceReminderSource({ children, taskId }: TaskRecurrenceReminderSourceProps) {
  const query = useTaskReminderQuery(taskId);
  const refetch = query.refetch;
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  if (query.isPending || query.isFetching) {
    return children({ status: "loading", absoluteReminderVersion: null, refresh });
  }
  if (!query.isSuccess && query.data === undefined) {
    return children({ status: "unavailable", absoluteReminderVersion: null, refresh });
  }

  const reminder = query.data ?? null;
  return children({
    status: "ready",
    absoluteReminderVersion: reminder?.spec.kind === "absolute" ? reminder.version : null,
    refresh,
  });
}
