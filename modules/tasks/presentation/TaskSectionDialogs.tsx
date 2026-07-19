"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { useId, useRef, useState } from "react";

import { isTaskApiError } from "./data/task-api-request";
import styles from "./TaskSectionControls.module.css";

export function SectionNameDialog({
  actionLabel,
  disabled,
  initialName = "",
  mutationError,
  onSubmit,
  open,
  setOpen,
  title,
  trigger,
}: Readonly<{
  actionLabel: string;
  disabled: boolean;
  initialName?: string;
  mutationError: Error | null;
  onSubmit: (name: string) => Promise<unknown>;
  open: boolean;
  setOpen: (open: boolean) => void;
  title: string;
  trigger?: ReactNode;
}>) {
  const fieldId = useId();
  const [name, setName] = useState(initialName);
  const [submitting, setSubmitting] = useState(false);
  const normalizedName = name.trim();
  const unchanged = Boolean(initialName) && normalizedName === initialName.trim();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !normalizedName) return;
    setSubmitting(true);
    try {
      await onSubmit(normalizedName);
      setOpen(false);
      setName(initialName);
    } catch {
      // The mutation owns the error; preserving this draft is the recovery path.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setName(initialName);
      }}
    >
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog}>
          <Dialog.Title className={styles.dialogTitle}>{title}</Dialog.Title>
          <Dialog.Description className={styles.dialogDescription}>
            Use a short name that makes this group easy to scan.
          </Dialog.Description>
          <form onSubmit={submit}>
            <label className={styles.label} htmlFor={fieldId}>
              Name
            </label>
            <input
              autoComplete="off"
              className={styles.input}
              id={fieldId}
              maxLength={120}
              required
              disabled={disabled}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {mutationError && (
              <p className={styles.error} role="alert">
                {isTaskApiError(mutationError) && mutationError.code === "CONFLICT"
                  ? "This section changed elsewhere. Your name is still here; review the latest list and try again."
                  : "The section was not saved. Your name is still here; try again."}
              </p>
            )}
            {disabled ? <p className={styles.error}>Reconnect to save this section.</p> : null}
            <div className={styles.dialogActions}>
              <Dialog.Close asChild>
                <button className="secondary-button" type="button">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                className="primary-button"
                type="submit"
                disabled={disabled || !normalizedName || unchanged || submitting}
              >
                {submitting ? `${actionLabel.replace(/ section$/, "")}…` : actionLabel}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SectionDeleteDialog({
  disabled,
  error,
  name,
  onConfirm,
  open,
  setOpen,
}: Readonly<{
  disabled: boolean;
  error: Error | null;
  name: string;
  onConfirm: () => Promise<unknown>;
  open: boolean;
  setOpen: (open: boolean) => void;
}>) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [submitting, setSubmitting] = useState(false);
  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={styles.overlay} />
        <AlertDialog.Content
          className={styles.dialog}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
        >
          <AlertDialog.Title className={styles.dialogTitle}>Delete “{name}”?</AlertDialog.Title>
          <AlertDialog.Description className={styles.dialogDescription}>
            This empty section will be deleted permanently. Its name cannot be restored with Undo.
          </AlertDialog.Description>
          {error && (
            <p className={styles.error} role="alert">
              {isTaskApiError(error) && error.code === "CONFLICT"
                ? "This section changed elsewhere and was not deleted. Review the latest list and try again."
                : "The section was not deleted. Nothing changed."}
            </p>
          )}
          <div className={styles.dialogActions}>
            <AlertDialog.Cancel asChild>
              <button ref={cancelRef} className="secondary-button" type="button">
                Keep section
              </button>
            </AlertDialog.Cancel>
            <button
              className={styles.dangerButton}
              type="button"
              disabled={disabled || submitting}
              onClick={async () => {
                if (disabled) return;
                setSubmitting(true);
                try {
                  await onConfirm();
                  setOpen(false);
                } catch {
                  // Keep the dialog open so the mutation error remains actionable.
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? "Deleting…" : "Delete section"}
            </button>
            {disabled ? <span className="sr-only">Reconnect to delete this section.</span> : null}
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
