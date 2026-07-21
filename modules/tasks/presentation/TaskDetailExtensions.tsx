"use client";

import { createContext, type ComponentType, type ReactNode, useContext } from "react";

import {
  noTaskRecurrenceReminderReview,
  type TaskRecurrenceReminderReview,
} from "./task-recurrence-reminder-review";
import type { RecurrenceLifecycle } from "../application/contracts/recurrence-contract";
import { isTaskApiError } from "./data/task-api-request";
import { useTaskRecurrenceQuery } from "./data/use-task-recurrence";
import { useTaskScheduleQuery } from "./data/use-task-schedule";

type TaskReminderDependency<T> =
  | Readonly<{ status: "loading"; retry: () => void }>
  | Readonly<{ status: "error"; permissionSafe: boolean; retry: () => void }>
  | Readonly<{ status: "ready"; value: T; stale: boolean; retry: () => void }>;

type TaskReminderSchedule =
  Readonly<{ kind: "all_day"; startAt: null }> | Readonly<{ kind: "timed"; startAt: string }> | null;

export type TaskReminderExtensionProps = Readonly<{
  task: Readonly<{
    id: string;
    status: "open" | "completed" | "cancelled";
    deleted: boolean;
    parentTaskId: string | null;
  }>;
  schedule: TaskReminderDependency<TaskReminderSchedule>;
  recurrence: TaskReminderDependency<"none" | RecurrenceLifecycle>;
  timeZone: string;
  disabled: boolean;
}>;

export type TaskRecurrenceReminderSourceProps = Readonly<{
  taskId: string;
  children: (review: TaskRecurrenceReminderReview) => ReactNode;
}>;

type TaskDetailExtensions = Readonly<{
  Reminder: ComponentType<TaskReminderExtensionProps> | null;
  RecurrenceReminderSource: ComponentType<TaskRecurrenceReminderSourceProps> | null;
}>;

const TaskDetailExtensionsContext = createContext<TaskDetailExtensions>({
  Reminder: null,
  RecurrenceReminderSource: null,
});

export function TaskDetailExtensionsProvider({
  children,
  reminder,
  recurrenceReminderSource,
}: Readonly<{
  children: ReactNode;
  reminder: ComponentType<TaskReminderExtensionProps>;
  recurrenceReminderSource: ComponentType<TaskRecurrenceReminderSourceProps>;
}>) {
  return (
    <TaskDetailExtensionsContext.Provider
      value={{ Reminder: reminder, RecurrenceReminderSource: recurrenceReminderSource }}
    >
      {children}
    </TaskDetailExtensionsContext.Provider>
  );
}

export function TaskRecurrenceReminderSourceExtension({
  children,
  taskId,
}: TaskRecurrenceReminderSourceProps) {
  const { RecurrenceReminderSource } = useContext(TaskDetailExtensionsContext);
  return RecurrenceReminderSource ? (
    <RecurrenceReminderSource taskId={taskId}>{children}</RecurrenceReminderSource>
  ) : (
    children(noTaskRecurrenceReminderReview)
  );
}

export function TaskReminderExtension(props: Omit<TaskReminderExtensionProps, "schedule" | "recurrence">) {
  const { Reminder } = useContext(TaskDetailExtensionsContext);
  return Reminder ? <TaskReminderExtensionData reminder={Reminder} {...props} /> : null;
}

function TaskReminderExtensionData({
  reminder: Reminder,
  ...props
}: Omit<TaskReminderExtensionProps, "schedule" | "recurrence"> &
  Readonly<{ reminder: ComponentType<TaskReminderExtensionProps> }>) {
  const scheduleQuery = useTaskScheduleQuery(props.task.id);
  const recurrenceQuery = useTaskRecurrenceQuery(props.task.id, props.task.parentTaskId === null);
  const schedule = scheduleDependency(scheduleQuery);
  const recurrence =
    props.task.parentTaskId === null
      ? recurrenceDependency(recurrenceQuery)
      : readyDependency("none" as const, false, () => undefined);

  return <Reminder {...props} schedule={schedule} recurrence={recurrence} />;
}

function scheduleDependency(
  query: ReturnType<typeof useTaskScheduleQuery>,
): TaskReminderDependency<TaskReminderSchedule> {
  const retry = () => void query.refetch();
  if (query.data !== undefined) {
    const value = query.data
      ? query.data.kind === "timed"
        ? { kind: "timed" as const, startAt: query.data.startAt }
        : { kind: "all_day" as const, startAt: null }
      : null;
    return readyDependency(value, query.isError, retry);
  }
  if (query.isError) return errorDependency(query.error, retry);
  return { status: "loading", retry };
}

function recurrenceDependency(
  query: ReturnType<typeof useTaskRecurrenceQuery>,
): TaskReminderDependency<"none" | RecurrenceLifecycle> {
  const retry = () => void query.refetch();
  if (query.data !== undefined) {
    return readyDependency(query.data?.lifecycle ?? "none", query.isError, retry);
  }
  if (query.isError) return errorDependency(query.error, retry);
  return { status: "loading", retry };
}

function readyDependency<T>(value: T, stale: boolean, retry: () => void): TaskReminderDependency<T> {
  return { status: "ready", value, stale, retry };
}

function errorDependency<T>(error: unknown, retry: () => void): TaskReminderDependency<T> {
  return {
    status: "error",
    permissionSafe: isTaskApiError(error) && (error.code === "FORBIDDEN" || error.code === "NOT_FOUND"),
    retry,
  };
}
