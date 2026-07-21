"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/presentation";

import type { TaskScheduleValue } from "../application/contracts";
import { TaskScheduleFields } from "./TaskScheduleFields";
import { createTaskScheduleDraft, interpretTaskScheduleDraft } from "./task-schedule-form-policy";
import styles from "./TaskQuickAdd.module.css";

export function TaskQuickAddScheduleDialog({
  hourCycle,
  onClose,
  onSave,
  open,
  schedule,
  timeZone,
}: Readonly<{
  hourCycle: "h12" | "h23";
  onClose: () => void;
  onSave: (schedule: TaskScheduleValue) => void;
  open: boolean;
  schedule: TaskScheduleValue | null;
  timeZone: string;
}>) {
  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        {open && schedule ? (
          <ScheduleForm
            key={JSON.stringify(schedule)}
            hourCycle={hourCycle}
            onClose={onClose}
            onSave={onSave}
            schedule={schedule}
            timeZone={timeZone}
          />
        ) : null}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ScheduleForm({
  hourCycle,
  onClose,
  onSave,
  schedule,
  timeZone,
}: Readonly<{
  hourCycle: "h12" | "h23";
  onClose: () => void;
  onSave: (schedule: TaskScheduleValue) => void;
  schedule: TaskScheduleValue;
  timeZone: string;
}>) {
  const [initialDraft] = useState(() => createTaskScheduleDraft(schedule, timeZone));
  const [draft, setDraft] = useState(initialDraft);
  const interpretation = interpretTaskScheduleDraft(draft, hourCycle);

  function requestClose() {
    const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft);
    if (dirty && !window.confirm("Discard these unsaved recognized-schedule changes?")) return;
    onClose();
  }

  return (
    <Dialog.Content
      className={styles.dialog}
      aria-describedby="quick-add-schedule-description"
      onEscapeKeyDown={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onPointerDownOutside={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onInteractOutside={(event) => event.preventDefault()}
    >
      <header className={styles.dialogHeader}>
        <div>
          <Dialog.Title>Edit recognized schedule</Dialog.Title>
          <Dialog.Description id="quick-add-schedule-description">
            Confirm the exact date, time, and timezone before creating this task.
          </Dialog.Description>
        </div>
        <button
          type="button"
          className={styles.dialogClose}
          aria-label="Close schedule editor"
          onClick={requestClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className={styles.dialogForm}>
        <TaskScheduleFields disabled={false} draft={draft} onChange={setDraft} taskId="quick-add" />
        <p className={interpretation.valid ? styles.scheduleSummary : styles.scheduleError} role="status">
          {interpretation.valid ? interpretation.summary : interpretation.message}
        </p>
        <footer className={styles.dialogActions}>
          <Button type="button" variant="secondary" onClick={requestClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!interpretation.valid}
            onClick={() => interpretation.valid && onSave(interpretation.schedule)}
          >
            Use schedule
          </Button>
        </footer>
      </div>
    </Dialog.Content>
  );
}
