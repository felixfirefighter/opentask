"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Archive } from "lucide-react";
import { useRef } from "react";

import styles from "./HabitArchiveDialog.module.css";

export function HabitArchiveDialog({
  disabled,
  habitTitle,
  onConfirm,
  pending,
}: Readonly<{
  disabled: boolean;
  habitTitle: string;
  onConfirm: () => void;
  pending: boolean;
}>) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <button className="quiet-button" type="button" disabled={disabled || pending}>
          <Archive size={16} aria-hidden="true" /> Archive
        </button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={styles.overlay} />
        <AlertDialog.Content
          className={styles.dialog}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
        >
          <AlertDialog.Title>Archive “{habitTitle}”?</AlertDialog.Title>
          <AlertDialog.Description>
            History will be preserved. This habit will leave Today and your active habits until you restore
            it.
          </AlertDialog.Description>
          <div className={styles.actions}>
            <AlertDialog.Cancel asChild>
              <button ref={cancelRef} className="secondary-button" type="button">
                Keep habit
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button className={styles.confirm} type="button" disabled={pending} onClick={onConfirm}>
                {pending ? "Archiving…" : "Archive habit"}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
