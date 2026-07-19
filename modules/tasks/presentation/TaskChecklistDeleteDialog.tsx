"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useRef } from "react";

import type { ChecklistItemDto } from "../application/contracts";
import styles from "./TaskChecklistDeleteDialog.module.css";

export function TaskChecklistDeleteDialog({
  disabled,
  error,
  item,
  onCancel,
  onConfirm,
  pending,
}: Readonly<{
  disabled: boolean;
  error: Error | null;
  item: ChecklistItemDto;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  pending: boolean;
}>) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog.Root open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={styles.dialogOverlay} />
        <AlertDialog.Content
          className={styles.dialogContent}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
        >
          <AlertDialog.Title className={styles.dialogTitle}>Remove checklist item?</AlertDialog.Title>
          <AlertDialog.Description className={styles.dialogDescription}>
            “{item.title}” will be removed from this task. This action cannot be undone.
          </AlertDialog.Description>
          {error ? (
            <p className={styles.error} role="alert">
              The checklist item was not removed. Review the task and try again.
            </p>
          ) : disabled ? (
            <p className={styles.message}>Reconnect to remove this checklist item.</p>
          ) : null}
          <div className={styles.dialogActions}>
            <AlertDialog.Cancel asChild>
              <button ref={cancelRef} className="secondary-button" type="button" disabled={pending}>
                Keep item
              </button>
            </AlertDialog.Cancel>
            <button
              className={styles.dangerButton}
              type="button"
              disabled={disabled || pending}
              onClick={onConfirm}
            >
              {pending ? "Removing…" : "Remove item"}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
