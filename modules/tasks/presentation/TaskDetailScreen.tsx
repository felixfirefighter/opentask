"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronLeft, Circle, MoreHorizontal, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useOnlineStatus } from "@/shared/presentation";

import type { TaskDetailDto, TaskStatus } from "../application/contracts";
import { isTaskApiError } from "./data/task-api-request";
import { useTaskRecurrenceQuery } from "./data/use-task-recurrence";
import { useDeleteTaskMutation, useTaskStatusMutation } from "./data/use-task-lifecycle-mutations";
import { useTaskDetailQuery } from "./data/use-task-queries";
import { TaskDeleteDialog } from "./TaskDeleteDialog";
import { TaskNotesEditor } from "./TaskNotesEditor";
import { TaskOrganizationEditor } from "./TaskOrganizationEditor";
import { TaskRecurrenceEditor } from "./TaskRecurrenceEditor";
import { TaskScheduleEditor } from "./TaskScheduleEditor";
import { TaskStepsEditor } from "./TaskStepsEditor";
import { TaskTitleEditor } from "./TaskTitleEditor";
import styles from "./TaskDetailScreen.module.css";
import {
  clearTaskDrafts,
  confirmTaskDraftNavigation,
  useTaskBeforeUnload,
  useTaskHistoryGuard,
} from "./task-draft-guard";

export type TaskDetailScreenProps = Readonly<{
  task: TaskDetailDto;
  mode: "inspector" | "page";
  inbox?: { id: string; name: string };
  onClose?: () => void;
  returnHref?: string;
  showRefreshError?: boolean;
}>;

export function TaskDetailScreen({
  inbox,
  mode,
  onClose,
  returnHref = "/inbox",
  showRefreshError = true,
  task: initialTask,
}: TaskDetailScreenProps) {
  const query = useTaskDetailQuery(initialTask.id, initialTask);
  const task = query.data ?? initialTask;
  const online = useOnlineStatus();
  const router = useRouter();
  const status = useTaskStatusMutation();
  const recurrenceQuery = useTaskRecurrenceQuery(task.id, task.parentTaskId === null);
  const recurrence = recurrenceQuery.data ?? null;
  const recurrenceUnknown =
    task.parentTaskId === null && !recurrenceQuery.isSuccess && recurrenceQuery.data === undefined;
  const completionBlocked =
    task.status === "open" &&
    task.parentTaskId === null &&
    (recurrenceUnknown || (recurrence !== null && recurrence.lifecycle !== "ended"));
  const remove = useDeleteTaskMutation(() => {
    clearTaskDrafts(task.id);
    if (onClose) onClose();
    else router.push(returnHref);
  });
  useTaskBeforeUnload(task.id);
  useTaskHistoryGuard(task.id);

  useEffect(() => {
    if (mode === "page") document.getElementById(`task-title-${task.id}`)?.focus();
  }, [mode, task.id]);

  useEffect(() => {
    function guardLinkNavigation(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey)
        return;
      const target =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.target === "_blank" || confirmTaskDraftNavigation(task.id)) return;
      event.preventDefault();
      event.stopPropagation();
    }

    document.addEventListener("click", guardLinkNavigation, true);
    return () => document.removeEventListener("click", guardLinkNavigation, true);
  }, [task.id]);

  function setStatus(nextStatus: TaskStatus) {
    if (nextStatus === "completed" && completionBlocked) return;
    status.mutate({ task, status: nextStatus });
  }

  function closeDetails() {
    if (confirmTaskDraftNavigation(task.id)) onClose?.();
  }

  const mutationError = status.error ?? remove.error;
  return (
    <article className={styles.panel} data-mode={mode} aria-labelledby={`task-title-${task.id}`}>
      <header className={styles.header}>
        {mode === "page" ? (
          <Link className={styles.back} href={returnHref} aria-label="Back to task list">
            <ChevronLeft size={20} aria-hidden="true" />
          </Link>
        ) : null}
        <button
          type="button"
          className={styles.status}
          disabled={!online || status.isPending || completionBlocked}
          title={
            completionBlocked && recurrenceUnknown
              ? "Loading recurrence status"
              : completionBlocked
                ? "End recurrence before completing this task"
                : undefined
          }
          onClick={() => setStatus(task.status === "open" ? "completed" : "open")}
        >
          {task.status === "open" ? (
            <Circle size={18} aria-hidden="true" />
          ) : (
            <RotateCcw size={18} aria-hidden="true" />
          )}
          <span>
            {task.status === "open" ? "Open" : task.status === "completed" ? "Completed" : "Cancelled"}
          </span>
        </button>
        <div className={styles.actions}>
          <TaskActions
            task={task}
            disabled={!online}
            completionBlocked={completionBlocked}
            onStatusChange={setStatus}
          />
          {mode === "inspector" ? (
            <button
              className="icon-button"
              type="button"
              onClick={closeDetails}
              aria-label="Close task details"
            >
              <X size={18} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </header>

      <div className={styles.body}>
        {showRefreshError && query.isError ? (
          <div className={styles.refreshError} role="status">
            <span>Showing saved task details. A fresh copy could not be loaded.</span>
            <button className="secondary-button" type="button" onClick={() => void query.refetch()}>
              Try again
            </button>
          </div>
        ) : null}
        {mutationError && (
          <div className={styles.error} role="alert">
            {isTaskApiError(mutationError) && mutationError.code === "CONFLICT"
              ? "This task changed elsewhere. Review the latest version before trying again."
              : "That task change was not saved. Your task remains available."}
          </div>
        )}
        {!online && <p className={styles.offline}>Task details are read-only while you’re offline.</p>}
        <TaskTitleEditor task={task} headingId={`task-title-${task.id}`} disabled={!online} />
        <TaskScheduleEditor key={task.id} task={task} disabled={!online} />
        <TaskRecurrenceEditor key={`recurrence-${task.id}`} task={task} disabled={!online} />
        <TaskOrganizationEditor
          task={task}
          inbox={inbox ?? { id: task.listId, name: "Current list" }}
          disabled={!online}
        />
        <TaskStepsEditor task={task} disabled={!online} />
        <TaskNotesEditor task={task} disabled={!online} />
        <TaskDeleteDialog task={task} mutation={remove} disabled={!online} />
      </div>
    </article>
  );
}

function TaskActions({
  completionBlocked,
  disabled,
  onStatusChange,
  task,
}: Readonly<{
  disabled: boolean;
  completionBlocked: boolean;
  onStatusChange: (status: TaskStatus) => void;
  task: TaskDetailDto;
}>) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="icon-button" type="button" aria-label={`More actions for ${task.title}`}>
          <MoreHorizontal size={18} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.menu} align="end" sideOffset={6}>
          {task.status === "open" ? (
            <>
              <DropdownMenu.Item
                className={styles.menuItem}
                disabled={disabled || completionBlocked}
                onSelect={() => onStatusChange("completed")}
              >
                Complete task
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={styles.menuItem}
                disabled={disabled}
                onSelect={() => onStatusChange("cancelled")}
              >
                Cancel task
              </DropdownMenu.Item>
            </>
          ) : (
            <DropdownMenu.Item
              className={styles.menuItem}
              disabled={disabled}
              onSelect={() => onStatusChange("open")}
            >
              Restore task
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className={styles.separator} />
          <DropdownMenu.Item
            className={styles.dangerItem}
            disabled={disabled}
            onSelect={() => document.getElementById(`delete-task-${task.id}`)?.click()}
          >
            Delete task…
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
