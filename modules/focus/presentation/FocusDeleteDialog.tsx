"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useRef, type RefObject } from "react";

import styles from "./FocusDialogs.module.css";

export function FocusDeleteDialog({
  completedAtLabel,
  onConfirm,
  onOpenChange,
  open,
  pending,
  returnFocusRef,
}: Readonly<{
  completedAtLabel: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}>) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={styles.overlay} />
        <AlertDialog.Content
          className={styles.dialog}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
        >
          <AlertDialog.Title>Delete this focus session?</AlertDialog.Title>
          <AlertDialog.Description>
            The session completed {completedAtLabel} will be removed from history and totals. This cannot be
            undone.
          </AlertDialog.Description>
          <div className={styles.actions}>
            <AlertDialog.Cancel asChild>
              <button ref={cancelRef} className="secondary-button" type="button" disabled={pending}>
                Keep session
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button className={styles.danger} type="button" disabled={pending} onClick={onConfirm}>
                {pending ? "Deleting…" : "Delete session"}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
