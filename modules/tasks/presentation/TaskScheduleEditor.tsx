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
  const validationRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (editor.validationError) validationRef.current?.focus();
  }, [editor.validationError]);

  function focusFirstScheduleField() {
    setTimeout(() => {
      formRef.current?.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus();
    }, 0);
  }

  if (editor.scheduleQuery.isPending || editor.preferencesQuery.isPending) {
    return <ScheduleLoading taskId={task.id} />;
  }
  if (!editor.preferences || (!editor.scheduleQuery.isSuccess && editor.scheduleQuery.data === undefined)) {
    return (
      <ScheduleUnavailable
        taskId={task.id}
        onRetry={() => {
          void editor.scheduleQuery.refetch();
          void editor.preferencesQuery.refetch();
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
      {editor.scheduleQuery.isError ? (
        <div className={styles.stale} role="status">
          <span>Showing the last loaded schedule. A fresh copy could not be loaded.</span>
          <button className="quiet-button" type="button" onClick={() => void editor.scheduleQuery.refetch()}>
            Try again
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
            disabled={editor.controlsDisabled}
            onChange={editor.changeDraft}
          />
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
              disabled={editor.mutation.isPending}
              onClick={editor.cancelEditing}
            >
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={editor.controlsDisabled}>
              {editor.mutation.isPending ? "Saving schedule…" : "Save schedule"}
            </button>
          </div>
        </form>
      ) : (
        <div className={styles.summaryActions}>
          <button
            className="secondary-button"
            type="button"
            disabled={editor.controlsDisabled}
            onClick={() => {
              editor.beginEditing();
              focusFirstScheduleField();
            }}
          >
            {editor.schedule ? "Edit schedule" : "Add schedule"}
          </button>
          {editor.schedule ? (
            <button
              className="quiet-button"
              type="button"
              disabled={editor.controlsDisabled}
              onClick={() => void editor.clearSchedule()}
            >
              Clear schedule
            </button>
          ) : null}
        </div>
      )}

      {editor.mutation.error ? (
        <TaskScheduleMutationFeedback
          conflict={editor.recovery.conflict}
          proposedSummary={editor.interpretation?.valid ? editor.interpretation.summary : null}
          latestSummary={latestSummary}
          loadingLatest={editor.recovery.loadingLatest || editor.scheduleQuery.isFetching}
          latestUnavailable={editor.recovery.latestUnavailable || editor.scheduleQuery.isError}
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
      <p className={styles.saveState} role="status" aria-live="polite">
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
