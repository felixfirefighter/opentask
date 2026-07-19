"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import type { UseMutationResult } from "@tanstack/react-query";
import { useRef, useState } from "react";

import type { TaskDetailDto, TaskDto, TaskListItemDto } from "../application/contracts";
import { isTaskApiError } from "./data/task-api-request";
import styles from "./TaskDeleteDialog.module.css";

export function TaskDeleteDialog({
  disabled,
  initialOpen = false,
  mutation,
  onOpenChange,
  showTrigger = true,
  task,
}: Readonly<{
  disabled: boolean;
  initialOpen?: boolean;
  mutation: UseMutationResult<TaskDto, Error, TaskDetailDto | TaskListItemDto, unknown>;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
  task: TaskDetailDto | TaskListItemDto;
}>) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(initialOpen);
  const conflict = isTaskApiError(mutation.error) && mutation.error.code === "CONFLICT";
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        onOpenChange?.(nextOpen);
        if (nextOpen) mutation.reset();
      }}
    >
      {showTrigger ? (
        <AlertDialog.Trigger asChild>
          <button
            className={styles.deleteTrigger}
            id={`delete-task-${task.id}`}
            type="button"
            disabled={disabled}
            title={disabled ? "Reconnect to delete this task" : undefined}
          >
            Delete task…
          </button>
        </AlertDialog.Trigger>
      ) : null}
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={styles.overlay} />
        <AlertDialog.Content
          className={styles.dialog}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
        >
          <AlertDialog.Title>Delete “{task.title}”?</AlertDialog.Title>
          <AlertDialog.Description>
            The task will leave active views immediately. You can restore it from the Undo action in the
            confirmation toast.
          </AlertDialog.Description>
          {mutation.error && (
            <p className={styles.error} role="alert">
              {conflict
                ? "This task changed elsewhere. Review the latest task before trying again."
                : "The task was not deleted. Nothing changed."}
            </p>
          )}
          <div className={styles.actions}>
            <AlertDialog.Cancel asChild>
              <button ref={cancelRef} className="secondary-button" type="button">
                Keep task
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                className={styles.confirm}
                type="button"
                disabled={disabled || mutation.isPending}
                onClick={(event) => {
                  event.preventDefault();
                  mutation.mutate(task, { onSuccess: () => setOpen(false) });
                }}
              >
                {mutation.isPending ? "Deleting…" : "Delete task"}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
