"use client";

import type { ReactNode } from "react";

import { TaskRecurrenceReminderSource, TaskReminderPanel } from "@/modules/notifications/presentation";
import { TaskDetailExtensionsProvider } from "@/modules/tasks/presentation";

export function TaskReminderComposition({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <TaskDetailExtensionsProvider
      recurrenceReminderSource={TaskRecurrenceReminderSource}
      reminder={TaskReminderPanel}
    >
      {children}
    </TaskDetailExtensionsProvider>
  );
}
