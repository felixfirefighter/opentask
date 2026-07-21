"use client";

import { Clock3, Pencil, Plus, X } from "lucide-react";
import { useId, type FormEvent } from "react";

import styles from "./TaskQuickAdd.module.css";
import { TaskQuickAddScheduleDialog } from "./TaskQuickAddScheduleDialog";
import { useTaskQuickAddController } from "./useTaskQuickAddController";

export function TaskQuickAdd({
  listId,
  listName,
  sectionId = null,
  timeZone,
  hourCycle,
}: Readonly<{
  hourCycle: "h12" | "h23";
  listId: string;
  listName: string;
  sectionId?: string | null;
  timeZone: string;
}>) {
  const inputId = useId();
  const controller = useTaskQuickAddController({ hourCycle, listId, sectionId, timeZone });
  const describedBy = !controller.online
    ? `${inputId}-offline`
    : controller.errorMessage
      ? `${inputId}-error`
      : controller.suggestionWarning
        ? `${inputId}-warning`
        : undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void controller.submit();
  }

  return (
    <div className={styles.composer}>
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.label} htmlFor={inputId}>
          New task
        </label>
        <div className={styles.entryRow}>
          <span className={styles.plus} aria-hidden="true">
            <Plus size={17} />
          </span>
          <input
            data-quick-add-input
            id={inputId}
            className={styles.input}
            type="text"
            maxLength={500}
            autoComplete="off"
            value={controller.title}
            onChange={(event) => controller.changeTitle(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && event.shiftKey) event.preventDefault();
              if (event.key === "Escape") {
                event.preventDefault();
                controller.escape();
              }
            }}
            placeholder="Add a task…"
            disabled={!controller.online || controller.isPending || controller.retryLocked}
            aria-describedby={describedBy}
          />
          <span className={styles.destination} title={`Add to ${listName}`}>
            {listName}
          </span>
          <button
            className="primary-button"
            type="submit"
            disabled={!controller.online || controller.isPending || controller.title.trim().length === 0}
          >
            {controller.isPending ? "Adding…" : "Add task"}
          </button>
        </div>
      </form>
      {controller.suggestionLabel ? (
        <div className={styles.confirmationRow}>
          <span className={styles.destinationToken}>
            <Clock3 size={14} aria-hidden="true" /> {listName}
          </span>
          <span className={styles.scheduleToken}>
            <button
              type="button"
              disabled={!controller.online || controller.isPending || controller.retryLocked}
              aria-label={`Edit recognized value ${controller.suggestionLabel}`}
              onClick={controller.editSchedule}
            >
              <Pencil size={12} aria-hidden="true" /> {controller.suggestionLabel}
            </button>
            <button
              type="button"
              disabled={controller.isPending || controller.retryLocked}
              aria-label={`Clear recognized value ${controller.suggestionLabel}`}
              onClick={controller.removeSchedule}
            >
              <X size={13} aria-hidden="true" />
            </button>
          </span>
        </div>
      ) : null}
      {controller.suggestionWarning ? (
        <p className={styles.warning} id={`${inputId}-warning`} role="status">
          {controller.suggestionWarning}
        </p>
      ) : null}
      {!controller.online && (
        <p className={styles.explanation} id={`${inputId}-offline`}>
          Reconnect to add tasks.
        </p>
      )}
      {controller.errorMessage && (
        <p className={styles.error} id={`${inputId}-error`} role="alert">
          {controller.errorMessage}
        </p>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {controller.announcement}
      </span>
      <TaskQuickAddScheduleDialog
        hourCycle={hourCycle}
        onClose={controller.closeSchedule}
        onSave={controller.saveSchedule}
        open={controller.scheduleEditorOpen}
        schedule={controller.acceptedSchedule}
        timeZone={timeZone}
      />
    </div>
  );
}
