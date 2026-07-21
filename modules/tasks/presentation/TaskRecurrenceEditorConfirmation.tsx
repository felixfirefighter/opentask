"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useRef } from "react";

import styles from "./TaskRecurrenceEditor.module.css";

export function TaskRecurrenceEditorConfirmation({
  busy,
  kind,
  onConfirm,
  onOpenChange,
  open,
}: Readonly<{
  busy: boolean;
  kind: "restart" | "end";
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}>) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const restart = kind === "restart";
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={styles.overlay} />
        <AlertDialog.Content
          className={styles.dialog}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
        >
          <AlertDialog.Title>
            {restart ? "Restart future recurrence?" : "End future recurrence?"}
          </AlertDialog.Title>
          <AlertDialog.Description>
            {restart
              ? "The saved schedule remains the series anchor. The edited rule starts at the first eligible occurrence after the server’s current day or time. Recorded occurrence history is kept."
              : "Future expansion stops at a server-selected boundary. The saved definition and recorded occurrence history remain, and you can restart the series later by editing it."}
          </AlertDialog.Description>
          <div className={styles.dialogActions}>
            <AlertDialog.Cancel asChild>
              <button ref={cancelRef} className="secondary-button" type="button" disabled={busy}>
                Keep current series
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                className="primary-button"
                type="button"
                disabled={busy}
                onClick={(event) => {
                  event.preventDefault();
                  onConfirm();
                }}
              >
                {busy
                  ? restart
                    ? "Restarting…"
                    : "Ending…"
                  : restart
                    ? "Restart future recurrence"
                    : "End future recurrence"}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
