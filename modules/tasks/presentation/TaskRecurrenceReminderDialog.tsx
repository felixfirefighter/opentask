"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef } from "react";

import styles from "./TaskRecurrenceEditor.module.css";
import dialogStyles from "./TaskRecurrenceReminderDialog.module.css";

export type TaskRecurrenceReminderChoice = "convert_relative_start" | "remove" | null;

export function TaskRecurrenceReminderDialog({
  busy,
  choice,
  error,
  offsetMinutes,
  onChoiceChange,
  onConfirm,
  onOffsetMinutesChange,
  onOpenChange,
  open,
  taskId,
}: Readonly<{
  busy: boolean;
  choice: TaskRecurrenceReminderChoice;
  error: string;
  offsetMinutes: string;
  onChoiceChange: (choice: Exclude<TaskRecurrenceReminderChoice, null>) => void;
  onConfirm: () => void;
  onOffsetMinutesChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  taskId: string;
}>) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.dialog}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
        >
          <Dialog.Title>Review the saved reminder</Dialog.Title>
          <Dialog.Description>
            Recurrence needs a reminder tied to each eligible start. Choose what happens to the existing
            absolute reminder in the same save. Nothing changes if you keep editing.
          </Dialog.Description>

          <fieldset className={dialogStyles.choices} disabled={busy}>
            <legend>Reminder choice</legend>
            <label className={dialogStyles.choice}>
              <input
                type="radio"
                name={`recurrence-reminder-${taskId}`}
                value="convert_relative_start"
                checked={choice === "convert_relative_start"}
                onChange={() => onChoiceChange("convert_relative_start")}
              />
              <span>
                <strong>Convert to before task start</strong>
                <small>Use the same offset for each next eligible occurrence.</small>
              </span>
            </label>
            <label className={dialogStyles.offset} htmlFor={`recurrence-reminder-offset-${taskId}`}>
              <span>Minutes before start</span>
              <input
                id={`recurrence-reminder-offset-${taskId}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={10_080}
                step={1}
                value={offsetMinutes}
                disabled={busy || choice !== "convert_relative_start"}
                aria-describedby={error ? `recurrence-reminder-error-${taskId}` : undefined}
                onChange={(event) => onOffsetMinutesChange(event.currentTarget.value)}
              />
            </label>
            <label className={dialogStyles.choice}>
              <input
                type="radio"
                name={`recurrence-reminder-${taskId}`}
                value="remove"
                checked={choice === "remove"}
                onChange={() => onChoiceChange("remove")}
              />
              <span>
                <strong>Remove the reminder</strong>
                <small>The recurrence is saved without a reminder.</small>
              </span>
            </label>
          </fieldset>

          {error ? (
            <p
              ref={errorRef}
              id={`recurrence-reminder-error-${taskId}`}
              className={dialogStyles.error}
              role="alert"
              tabIndex={-1}
            >
              {error}
            </p>
          ) : null}

          <div className={styles.dialogActions}>
            <Dialog.Close asChild>
              <button ref={cancelRef} className="secondary-button" type="button" disabled={busy}>
                Keep editing
              </button>
            </Dialog.Close>
            <button className="primary-button" type="button" disabled={busy} onClick={onConfirm}>
              {busy ? "Saving recurrence…" : "Continue with recurrence"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
