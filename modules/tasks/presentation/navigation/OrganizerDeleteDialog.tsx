"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";

import type { FolderDto, RegularListDto } from "../../application/contracts";
import styles from "./OrganizerDeleteDialog.module.css";

export type OrganizerDeleteTarget =
  Readonly<{ folder: FolderDto; kind: "folder" }> | Readonly<{ kind: "list"; list: RegularListDto }>;

export function OrganizerDeleteDialog({
  disabled,
  errorMessage,
  isPending,
  onConfirm,
  onDismiss,
  target,
}: Readonly<{
  disabled: boolean;
  errorMessage: string | null;
  isPending: boolean;
  onConfirm: (target: OrganizerDeleteTarget) => Promise<boolean>;
  onDismiss: () => void;
  target: OrganizerDeleteTarget | null;
}>) {
  if (!target) return null;
  const isList = target.kind === "list";
  const name = isList ? target.list.name : target.folder.name;

  return (
    <AlertDialog.Root open onOpenChange={(open) => !open && onDismiss()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={styles.overlay} />
        <AlertDialog.Content className={styles.content}>
          <AlertDialog.Title className={styles.title}>Delete {isList ? "list" : "folder"}?</AlertDialog.Title>
          <AlertDialog.Description className={styles.description}>
            {isList
              ? `“${name}” will be hidden and its active tasks will move to Inbox. Undo restores the list, but moved tasks remain in Inbox.`
              : `“${name}” will be hidden and its lists will appear without a folder. Undo restores the folder and reattaches them.`}
          </AlertDialog.Description>
          {errorMessage ? (
            <p className={styles.error} role="alert">
              {errorMessage}
            </p>
          ) : null}
          <footer className={styles.actions}>
            <AlertDialog.Cancel className={styles.secondaryButton}>
              Keep {isList ? "list" : "folder"}
            </AlertDialog.Cancel>
            <AlertDialog.Action
              className={styles.dangerButton}
              disabled={disabled || isPending}
              onClick={(event) => {
                event.preventDefault();
                if (disabled) return;
                void onConfirm(target).then((deleted) => deleted && onDismiss());
              }}
            >
              {isPending ? "Deleting" : `Delete ${isList ? "list" : "folder"}`}
            </AlertDialog.Action>
            {disabled ? <span className="sr-only">Reconnect to delete this item.</span> : null}
          </footer>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
