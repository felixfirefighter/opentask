"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useRef, type RefObject } from "react";

import styles from "./FocusDialogs.module.css";

export function FocusDiscardDialog({
  onConfirm,
  onOpenChange,
  open,
  pending,
  returnFocusRef,
  subject,
}: Readonly<{
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  subject: "focus timer" | "break timer";
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
          <AlertDialog.Title>Discard this {subject}?</AlertDialog.Title>
          <AlertDialog.Description>
            This unfinished interval will be removed and will not appear in Focus history or totals.
          </AlertDialog.Description>
          <div className={styles.actions}>
            <AlertDialog.Cancel asChild>
              <button ref={cancelRef} className="secondary-button" type="button" disabled={pending}>
                Keep timer
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button className={styles.danger} type="button" disabled={pending} onClick={onConfirm}>
                {pending ? "Discarding…" : "Discard timer"}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
