"use client";

import { CalendarClock, Check, RefreshCw } from "lucide-react";
import { type FormEvent, useEffect, useRef } from "react";

import type { TaskDetailDto } from "../application/contracts";
import { TaskScheduleFields } from "./TaskScheduleFields";
import styles from "./TaskScheduleEditor.module.css";
import { TaskScheduleMutationFeedback } from "./TaskScheduleMutationFeedback";
import { formatTaskSchedule } from "./task-schedule-form-policy";
import { useTaskScheduleEditorController } from "./use-task-schedule-editor-controller";

export function TaskScheduleEditor({ disabled, task }: Readonly<{ disabled: boolean; task: TaskDetailDto }>) {
  const editor = useTaskScheduleEditorController(task, disabled);
  const formRef = useRef<HTMLFormElement>(null);
  const mutationFeedbackRef = useRef<HTMLDivElement>(null);
  const saveStateRef = useRef<HTMLParagraphElement>(null);
  const validationRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (editor.validationError) validationRef.current?.focus();
  }, [editor.validationError]);

  useEffect(() => {
    if (editor.mutation.error && editor.lastAttempt === "clear") {
      mutationFeedbackRef.current?.focus();
    }
  }, [editor.lastAttempt, editor.mutation.error]);

  useEffect(() => {
    if (editor.reconciledAttempt) saveStateRef.current?.focus();
  }, [editor.reconciledAttempt]);

  function focusFirstScheduleField() {
    setTimeout(() => {
      formRef.current?.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus();
    }, 0);
  }

  if (
    editor.scheduleQuery.isPending ||
    editor.preferencesQuery.isPending ||
    editor.recurrenceQuery.isPending
  ) {
    return <ScheduleLoading taskId={task.id} />;
  }
  if (
    !editor.preferences ||
    (!editor.scheduleQuery.isSuccess && editor.scheduleQuery.data === undefined) ||
    (!editor.recurrenceQuery.isSuccess && editor.recurrenceQuery.data === undefined)
  ) {
    return (
      <ScheduleUnavailable
        taskId={task.id}
        onRetry={() => {
          void editor.scheduleQuery.refetch();
          void editor.preferencesQuery.refetch();
          void editor.recurrenceQuery.refetch();
        }}
      />
    );
  }

  const latestSummary = editor.schedule
    ? formatTaskSchedule(editor.schedule, editor.preferences.timeZone, editor.preferences.hourCycle)
    : null;
  return (
    <section className={styles.group} aria-labelledby={`schedule-title-${task.id}`}>
      <div className={styles.heading}>
        <div>
          <h2 id={`schedule-title-${task.id}`}>Schedule</h2>
          <p>{editor.summary}</p>
        </div>
        <CalendarClock size={18} aria-hidden="true" />
      </div>
      {editor.scheduleQuery.isError || editor.recurrenceQuery.isError ? (
        <div className={styles.stale} role="status">
          <span>Showing the last loaded schedule. A fresh copy could not be loaded.</span>
          <button className="quiet-button" type="button" onClick={editor.refreshLatest}>
            Refresh schedule
          </button>
        </div>
      ) : null}

      {editor.draft ? (
        <form
          ref={formRef}
          className={styles.form}
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            void editor.saveSchedule();
          }}
        >
          <TaskScheduleFields
            taskId={task.id}
            draft={editor.draft}
            disabled={editor.scheduleEditDisabled}
            onChange={editor.changeDraft}
          />
          {editor.recurrence ? (
            <p className={styles.seriesNote}>
              Saving changes restarts future occurrences while preserving recorded history.
            </p>
          ) : null}
          <p className={styles.interpretation}>
            {editor.interpretation?.valid
              ? `Interpreted as: ${editor.interpretation.summary}`
              : editor.interpretation?.message}
          </p>
          {editor.validationError ? (
            <p ref={validationRef} className={styles.validationError} role="alert" tabIndex={-1}>
              {editor.validationError}
            </p>
          ) : null}
          <div className={styles.actions}>
            <button
              className="quiet-button"
              type="button"
              disabled={editor.scheduleEditDisabled || editor.recovery.needsLatest}
              onClick={editor.cancelEditing}
            >
              Cancel
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={editor.scheduleEditDisabled || editor.recovery.needsLatest}
            >
              {editor.mutation.isPending ? "Saving schedule…" : "Save schedule"}
            </button>
          </div>
        </form>
      ) : (
        <div className={styles.summaryActions}>
          <button
            className="secondary-button"
            type="button"
            disabled={editor.scheduleEditDisabled || editor.recovery.needsLatest}
            onClick={() => {
              editor.beginEditing();
              focusFirstScheduleField();
            }}
          >
            {editor.schedule
              ? editor.recurrence
                ? "Edit recurring schedule"
                : "Edit schedule"
              : "Add schedule"}
          </button>
          {editor.schedule && (!editor.recurrence || editor.recurrence.lifecycle === "ended") ? (
            <button
              className="quiet-button"
              type="button"
              disabled={editor.controlsDisabled || editor.recovery.needsLatest}
              onClick={() => void editor.clearSchedule()}
            >
              Clear schedule
            </button>
          ) : null}
        </div>
      )}

      {editor.mutation.error ? (
        <TaskScheduleMutationFeedback
          alertRef={mutationFeedbackRef}
          conflict={editor.recovery.conflict}
          unconfirmed={editor.recovery.unconfirmed}
          proposedSummary={
            editor.lastAttempt === "clear"
              ? "No schedule"
              : editor.interpretation?.valid
                ? editor.interpretation.summary
                : null
          }
          latestSummary={latestSummary}
          latestMatchesProposal={editor.latestMatchesAttempt}
          loadingLatest={editor.recovery.loadingLatest || editor.scheduleQuery.isFetching}
          latestUnavailable={
            editor.recovery.latestUnavailable ||
            editor.scheduleQuery.isError ||
            editor.recurrenceQuery.isError
          }
          pending={editor.mutation.isPending}
          onKeepEditing={() => {
            editor.keepEditing();
            focusFirstScheduleField();
          }}
          onRefreshLatest={editor.refreshLatest}
          onRetry={() => void editor.retry()}
          onUseLatest={() => void editor.useLatest()}
        />
      ) : null}
      <p
        ref={saveStateRef}
        className={styles.saveState}
        role="status"
        aria-live="polite"
        tabIndex={editor.reconciledAttempt ? -1 : undefined}
      >
        {editor.mutation.isPending ? (
          <>
            <RefreshCw size={13} aria-hidden="true" /> Saving schedule…
          </>
        ) : editor.saveMessage ? (
          <>
            <Check size={13} aria-hidden="true" /> {editor.saveMessage}
          </>
        ) : disabled ? (
          "Reconnect to edit this schedule."
        ) : (
          ""
        )}
      </p>
    </section>
  );
}

function ScheduleLoading({ taskId }: Readonly<{ taskId: string }>) {
  return (
    <section className={styles.group} aria-labelledby={`schedule-title-${taskId}`} aria-busy="true">
      <h2 id={`schedule-title-${taskId}`}>Schedule</h2>
      <p role="status">Loading schedule…</p>
      <span className={styles.skeleton} aria-hidden="true" />
    </section>
  );
}

function ScheduleUnavailable({ taskId, onRetry }: Readonly<{ taskId: string; onRetry: () => void }>) {
  return (
    <section className={styles.group} aria-labelledby={`schedule-title-${taskId}`}>
      <h2 id={`schedule-title-${taskId}`}>Schedule</h2>
      <div className={styles.loadError} role="alert">
        <span>Schedule settings could not be loaded. Your task was not changed.</span>
        <button className="secondary-button" type="button" onClick={onRetry}>
          Try again
        </button>
      </div>
    </section>
  );
}
