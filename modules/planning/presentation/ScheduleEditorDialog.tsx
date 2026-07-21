"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { type Dispatch, type FormEvent, type SetStateAction, useState } from "react";

import { Button } from "@/shared/presentation";

import type { PlanningSchedule } from "./planning-client-api";
import type { ScheduleSaveOutcome } from "./planning-screen-model";
import { initialScheduleForm, scheduleFromForm, type ScheduleFormValues } from "./schedule-form-policy";
import type { MutablePlanningTask } from "./use-planning-task-controller";
import styles from "./ScheduleEditorDialog.module.css";

type ScheduleEditorProps = Readonly<{
  localDate: string;
  onClose: () => void;
  onSave: (taskId: string, schedule: PlanningSchedule) => Promise<ScheduleSaveOutcome>;
  task: MutablePlanningTask | null;
  timeZone: string;
}>;

export function ScheduleEditorDialog(props: ScheduleEditorProps) {
  return (
    <Dialog.Root open={props.task !== null}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        {props.task ? <ScheduleEditorContent key={props.task.id} {...props} task={props.task} /> : null}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ScheduleEditorContent({
  localDate,
  onClose,
  onSave,
  task,
  timeZone,
}: ScheduleEditorProps & { task: MutablePlanningTask }) {
  const [initialValues] = useState(() => initialScheduleForm(task.schedule, localDate, timeZone));
  const [values, setValues] = useState(initialValues);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError("");
    try {
      const schedule = scheduleFromForm(values, timeZone);
      setPending(true);
      const outcome = await onSave(task.id, schedule);
      if (outcome === "failed") {
        setError("The schedule was not saved. Review the latest task and try again.");
      } else if (outcome === "unconfirmed") {
        setError(
          "The schedule-change outcome could not be confirmed. Your edited schedule is still here while the latest task is loaded.",
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Enter a valid schedule.");
    } finally {
      setPending(false);
    }
  }

  function requestClose() {
    if (pending) return;
    const dirty = JSON.stringify(values) !== JSON.stringify(initialValues);
    if (dirty && !window.confirm("Discard these unsaved schedule changes?")) return;
    onClose();
  }

  return (
    <Dialog.Content
      className={styles.dialog}
      aria-describedby="schedule-editor-description"
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
      <header className={styles.header}>
        <div>
          <Dialog.Title>Edit schedule</Dialog.Title>
          <Dialog.Description id="schedule-editor-description">
            Choose the exact date and time for {task.title}.
          </Dialog.Description>
        </div>
        <button
          type="button"
          className={styles.close}
          disabled={pending}
          aria-label="Close schedule editor"
          onClick={requestClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={values.allDay}
            disabled={pending}
            onChange={(event) => update(setValues, "allDay", event.currentTarget.checked)}
          />
          <span>All-day schedule</span>
        </label>
        {values.allDay ? (
          <div className={styles.fields}>
            <Field
              label="Start date"
              type="date"
              value={values.startDate}
              disabled={pending}
              onChange={(value) => update(setValues, "startDate", value)}
            />
            <Field
              label="End date (exclusive)"
              type="date"
              value={values.endDate}
              disabled={pending}
              onChange={(value) => update(setValues, "endDate", value)}
            />
          </div>
        ) : (
          <div className={styles.fields}>
            <Field
              label="Start"
              type="datetime-local"
              value={values.startLocal}
              disabled={pending}
              onChange={(value) => update(setValues, "startLocal", value)}
            />
            <Field
              label="End"
              type="datetime-local"
              value={values.endLocal}
              disabled={pending}
              onChange={(value) => update(setValues, "endLocal", value)}
            />
          </div>
        )}
        <label className={styles.timeZone}>
          <span>Timezone</span>
          <select value={timeZone} disabled aria-label="Schedule timezone">
            <option value={timeZone}>{timeZone}</option>
          </select>
          <small>Change your saved timezone in Settings.</small>
        </label>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <footer className={styles.actions}>
          <Button type="button" variant="secondary" disabled={pending} onClick={requestClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save schedule"}
          </Button>
        </footer>
      </form>
    </Dialog.Content>
  );
}

type FieldProps = Readonly<{
  label: string;
  type: "date" | "datetime-local";
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}>;

function Field({ disabled, label, onChange, type, value }: FieldProps) {
  return (
    <label>
      <span>{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        required
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function update<K extends keyof ScheduleFormValues>(
  setValues: Dispatch<SetStateAction<ScheduleFormValues>>,
  key: K,
  value: ScheduleFormValues[K],
) {
  setValues((current) => ({ ...current, [key]: value }));
}
