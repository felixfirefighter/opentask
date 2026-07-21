"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";

import {
  Button,
  markWorkspaceRoutesStale,
  useOnlineStatus,
  useUnsavedNavigationGuard,
} from "@/shared/presentation";

import { CalendarTaskCreateFields, type CalendarTaskDraft } from "./CalendarTaskCreateFields";
import { createPlanningTaskWithSchedule, PlanningClientError } from "./planning-client-api";
import { initialScheduleForm, scheduleFromForm, type ScheduleFormValues } from "./schedule-form-policy";
import styles from "./ScheduleEditorDialog.module.css";
import { useCalendarTaskLists } from "./use-calendar-task-lists";

type CalendarTaskCreateDialogProps = Readonly<{
  inboxId: string;
  inboxName: string;
  initialDate: string;
  open: boolean;
  timeZone: string;
  onClose: () => void;
  onCreated?: (() => void) | undefined;
}>;

type CalendarCreateCommand = Parameters<typeof createPlanningTaskWithSchedule>[1];

export function CalendarTaskCreateDialog(props: CalendarTaskCreateDialogProps) {
  return (
    <Dialog.Root open={props.open}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        {props.open ? <CalendarTaskCreateContent key={props.initialDate} {...props} /> : null}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CalendarTaskCreateContent({
  inboxId,
  inboxName,
  initialDate,
  onClose,
  onCreated,
  timeZone,
}: CalendarTaskCreateDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const initialTaskDraft: CalendarTaskDraft = {
    title: "",
    descriptionMd: "",
    priority: "none",
    listId: inboxId,
  };
  const [taskDraft, setTaskDraft] = useState<CalendarTaskDraft>(() => initialTaskDraft);
  const initialValues = initialScheduleForm(null, initialDate, timeZone);
  const [values, setValues] = useState<ScheduleFormValues>(() => initialValues);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const commandDraft = useRef<Readonly<{
    command: CalendarCreateCommand;
    fingerprint: string;
    id: string;
  }> | null>(null);
  const taskLists = useCalendarTaskLists();

  useUnsavedNavigationGuard(
    uncertain,
    "Discard this unconfirmed scheduled task create? It may already exist, and leaving will discard its safe retry key.",
    discardUnconfirmedCreate,
  );

  function discardUnconfirmedCreate() {
    commandDraft.current = null;
    setError("");
    setUncertain(false);
    markWorkspaceRoutesStale();
    router.refresh();
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = taskDraft.title.trim();
    if (!cleanTitle || pending || !online) return;
    setError("");
    try {
      const schedule = scheduleFromForm(values, timeZone);
      const command = { ...taskDraft, title: cleanTitle, schedule };
      const fingerprint = JSON.stringify(command);
      if (!commandDraft.current || (!uncertain && commandDraft.current.fingerprint !== fingerprint)) {
        commandDraft.current = { command, fingerprint, id: crypto.randomUUID() };
      }
      const submittedDraft = commandDraft.current;
      setPending(true);
      await createPlanningTaskWithSchedule(submittedDraft.id, submittedDraft.command);
      await queryClient.invalidateQueries();
      markWorkspaceRoutesStale();
      router.refresh();
      onCreated?.();
      onClose();
    } catch (caught) {
      const outcomeUnconfirmed =
        (!(caught instanceof PlanningClientError) &&
          !(caught instanceof Error && caught.name === "RangeError")) ||
        (caught instanceof PlanningClientError && caught.code === "INTERNAL");
      setUncertain(outcomeUnconfirmed);
      setError(
        caught instanceof PlanningClientError && caught.code === "CONFLICT"
          ? "This task draft changed after its create key was used. Edit a field, then try again."
          : caught instanceof Error && caught.name === "RangeError"
            ? caught.message
            : caught instanceof PlanningClientError && caught.code !== "INTERNAL"
              ? `${caught.message} Every field is still here.`
              : "The create outcome could not be confirmed. Retry this unchanged draft to resolve it safely; every field is still here.",
      );
      if (outcomeUnconfirmed) {
        await queryClient.invalidateQueries().catch(() => undefined);
        markWorkspaceRoutesStale();
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  function changeValues<K extends keyof ScheduleFormValues>(key: K, value: ScheduleFormValues[K]) {
    if (pending || uncertain) return;
    commandDraft.current = null;
    setError("");
    setValues((current) => ({ ...current, [key]: value }));
  }

  function changeTaskDraft<K extends keyof CalendarTaskDraft>(key: K, value: CalendarTaskDraft[K]) {
    if (pending || uncertain) return;
    commandDraft.current = null;
    setError("");
    setTaskDraft((current) => ({ ...current, [key]: value }));
  }

  function requestClose() {
    if (pending) return;
    if (uncertain) {
      if (
        !window.confirm(
          "The create outcome has not been confirmed. Closing discards the safe retry key. Close anyway?",
        )
      ) {
        return;
      }
      discardUnconfirmedCreate();
      return;
    }
    const dirty =
      JSON.stringify(taskDraft) !== JSON.stringify(initialTaskDraft) ||
      JSON.stringify(values) !== JSON.stringify(initialValues);
    if (dirty && !window.confirm("Discard this unsaved scheduled task draft?")) return;
    onClose();
  }

  const fieldsLocked = pending || uncertain;

  return (
    <Dialog.Content
      className={styles.dialog}
      aria-describedby="calendar-create-description"
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
          <Dialog.Title>Create scheduled task</Dialog.Title>
          <Dialog.Description id="calendar-create-description">
            Set task details, destination, and an exact schedule in the visible calendar range.
          </Dialog.Description>
        </div>
        <button
          type="button"
          className={styles.close}
          disabled={pending}
          aria-label="Close task form"
          onClick={requestClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <form className={styles.form} onSubmit={submit}>
        <CalendarTaskCreateFields
          draft={taskDraft}
          fieldsLocked={fieldsLocked}
          inbox={{ id: inboxId, name: inboxName }}
          listError={taskLists.error}
          listHasNextPage={taskLists.hasNextPage}
          listLoading={taskLists.isLoading}
          regularLists={taskLists.lists}
          schedule={values}
          timeZone={timeZone}
          onLoadMoreLists={() => void taskLists.loadMore()}
          onRetryLists={() => void taskLists.retry()}
          onScheduleChange={changeValues}
          onTaskChange={changeTaskDraft}
        />
        {!online ? <p className={styles.error}>Reconnect to create this task.</p> : null}
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <footer className={styles.actions}>
          <Button type="button" variant="secondary" disabled={pending} onClick={requestClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !online || !taskDraft.title.trim()}>
            {pending ? "Creating…" : uncertain ? "Retry exact task" : "Create task"}
          </Button>
        </footer>
      </form>
    </Dialog.Content>
  );
}
