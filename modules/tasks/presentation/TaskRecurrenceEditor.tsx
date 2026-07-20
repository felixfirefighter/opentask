"use client";

import { Check, RefreshCw, Repeat2 } from "lucide-react";
import { useEffect, useRef } from "react";

import type { TaskDetailDto } from "../application/contracts";
import { isTaskApiError } from "./data/task-api-request";
import styles from "./TaskRecurrenceEditor.module.css";
import { TaskRecurrenceEditorConfirmation } from "./TaskRecurrenceEditorConfirmation";
import { TaskRecurrenceEditorFeedback } from "./TaskRecurrenceEditorFeedback";
import { TaskRecurrenceEditorForm } from "./TaskRecurrenceEditorForm";
import { useTaskRecurrenceEditorController } from "./use-task-recurrence-editor-controller";

export function TaskRecurrenceEditor({
  disabled,
  task,
}: Readonly<{ disabled: boolean; task: TaskDetailDto }>) {
  const editor = useTaskRecurrenceEditorController(task, disabled);
  const feedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editor.mutation.error) feedbackRef.current?.focus();
  }, [editor.mutation.error]);

  if (task.parentTaskId !== null) {
    return <RecurrencePrerequisite taskId={task.id} text="Recurrence is available only for root tasks." />;
  }
  if (
    editor.recurrenceQuery.isPending ||
    editor.scheduleQuery.isPending ||
    editor.preferencesQuery.isPending
  ) {
    return <RecurrenceLoading taskId={task.id} />;
  }
  const initialLoadFailed =
    (!editor.recurrenceQuery.isSuccess && editor.recurrenceQuery.data === undefined) ||
    (!editor.scheduleQuery.isSuccess && editor.scheduleQuery.data === undefined) ||
    !editor.preferences;
  if (initialLoadFailed) {
    const permissionSafe =
      isTaskApiError(editor.recurrenceQuery.error) &&
      (editor.recurrenceQuery.error.code === "FORBIDDEN" ||
        editor.recurrenceQuery.error.code === "NOT_FOUND");
    return (
      <RecurrenceUnavailable
        taskId={task.id}
        permissionSafe={permissionSafe}
        disabled={disabled}
        onRetry={() => {
          void editor.recurrenceQuery.refetch();
          void editor.scheduleQuery.refetch();
          void editor.preferencesQuery.refetch();
        }}
      />
    );
  }
  if (!editor.schedule) {
    return <RecurrencePrerequisite taskId={task.id} text="Add a schedule before adding recurrence." />;
  }

  const editableOwner = task.status === "open" && task.deletedAt === null;
  const latestSummary = editor.summary;
  return (
    <section className={styles.group} aria-labelledby={`recurrence-title-${task.id}`}>
      <div className={styles.heading}>
        <div>
          <div className={styles.titleLine}>
            <h2 id={`recurrence-title-${task.id}`}>Recurrence</h2>
            {editor.recurrence ? (
              <span className={styles.lifecycle} data-state={editor.recurrence.lifecycle}>
                {lifecycleLabel(editor.recurrence.lifecycle)}
              </span>
            ) : null}
          </div>
          <p>{editor.summary ?? "Does not repeat"}</p>
        </div>
        <Repeat2 size={18} aria-hidden="true" />
      </div>

      {editor.recurrenceQuery.isError || editor.scheduleQuery.isError ? (
        <div className={styles.stale} role="status">
          <span>Showing the last loaded recurrence. A fresh copy could not be loaded.</span>
          <button
            className="quiet-button"
            type="button"
            onClick={() => void editor.recurrenceQuery.refetch()}
          >
            Refresh recurrence
          </button>
        </div>
      ) : null}

      {editor.draft ? (
        <TaskRecurrenceEditorForm editor={editor} />
      ) : (
        <RecurrenceActions editor={editor} editableOwner={editableOwner} disabled={disabled} />
      )}

      {editor.mutation.error ? (
        <TaskRecurrenceEditorFeedback
          alertRef={feedbackRef}
          canRetry={editor.canRetry}
          error={editor.mutation.error}
          latestMatchesAttempt={editor.latestMatchesAttempt}
          latestSummary={latestSummary}
          latestUnavailable={editor.recovery.latestUnavailable || editor.recurrenceQuery.isError}
          loadingLatest={editor.recovery.loadingLatest || editor.recurrenceQuery.isFetching}
          pending={editor.mutation.isPending}
          proposedSummary={editor.interpretation?.valid ? editor.interpretation.summary : null}
          recovering={editor.recovery.needsLatest}
          recoveryReady={editor.recoveryReady}
          onKeepEditing={editor.keepEditing}
          onRefreshLatest={() => {
            void editor.recovery.refetchLatest();
            void editor.recurrenceQuery.refetch();
          }}
          onRetry={() => void editor.retry()}
          onUseLatest={() => void editor.useLatest()}
        />
      ) : null}
      <p className={styles.saveState} role="status" aria-live="polite">
        {editor.mutation.isPending ? (
          <>
            <RefreshCw size={13} aria-hidden="true" /> Saving recurrence…
          </>
        ) : editor.saveMessage ? (
          <>
            <Check size={13} aria-hidden="true" /> {editor.saveMessage}
          </>
        ) : disabled ? (
          "Reconnect to edit recurrence."
        ) : (
          ""
        )}
      </p>

      <TaskRecurrenceEditorConfirmation
        busy={editor.mutation.isPending}
        kind="restart"
        open={editor.restartConfirmationOpen}
        onOpenChange={editor.setRestartConfirmationOpen}
        onConfirm={() => void editor.confirmRestart()}
      />
      <TaskRecurrenceEditorConfirmation
        busy={editor.mutation.isPending}
        kind="end"
        open={editor.endConfirmationOpen}
        onOpenChange={editor.setEndConfirmationOpen}
        onConfirm={() => void editor.confirmEnd()}
      />
    </section>
  );
}

type Editor = ReturnType<typeof useTaskRecurrenceEditorController>;

function RecurrenceActions({
  editor,
  editableOwner,
  disabled,
}: Readonly<{ editor: Editor; editableOwner: boolean; disabled: boolean }>) {
  const unavailable = disabled || !editableOwner;
  return (
    <div className={styles.summaryActions}>
      <button className="secondary-button" type="button" disabled={unavailable} onClick={editor.beginEditing}>
        {editor.recurrence
          ? editor.recurrence.lifecycle === "ended"
            ? "Restart recurrence"
            : "Edit recurrence"
          : "Add recurrence"}
      </button>
      {editor.recurrence && editor.recurrence.lifecycle !== "ended" ? (
        <button
          className="quiet-button"
          type="button"
          disabled={unavailable}
          onClick={() => editor.setEndConfirmationOpen(true)}
        >
          End recurrence…
        </button>
      ) : null}
      {recurrenceGuidance(editor, editableOwner)}
    </div>
  );
}

function RecurrenceLoading({ taskId }: Readonly<{ taskId: string }>) {
  return (
    <section className={styles.group} aria-labelledby={`recurrence-title-${taskId}`} aria-busy="true">
      <h2 id={`recurrence-title-${taskId}`}>Recurrence</h2>
      <p role="status">Loading recurrence…</p>
      <span className={styles.skeleton} aria-hidden="true" />
    </section>
  );
}

function RecurrenceUnavailable({
  taskId,
  permissionSafe,
  disabled,
  onRetry,
}: Readonly<{ taskId: string; permissionSafe: boolean; disabled: boolean; onRetry: () => void }>) {
  return (
    <section className={styles.group} aria-labelledby={`recurrence-title-${taskId}`}>
      <h2 id={`recurrence-title-${taskId}`}>Recurrence</h2>
      <div className={styles.loadError} role="alert">
        <span>
          {disabled
            ? "Recurrence settings are unavailable while offline."
            : permissionSafe
              ? "Recurrence is unavailable."
              : "Recurrence settings could not be loaded. Your task was not changed."}
        </span>
        {!disabled && !permissionSafe ? (
          <button className="secondary-button" type="button" onClick={onRetry}>
            Try again
          </button>
        ) : null}
      </div>
    </section>
  );
}

function RecurrencePrerequisite({ taskId, text }: Readonly<{ taskId: string; text: string }>) {
  return (
    <section className={styles.group} aria-labelledby={`recurrence-title-${taskId}`}>
      <div className={styles.heading}>
        <div>
          <h2 id={`recurrence-title-${taskId}`}>Recurrence</h2>
          <p>{text}</p>
        </div>
        <Repeat2 size={18} aria-hidden="true" />
      </div>
    </section>
  );
}

function lifecycleLabel(lifecycle: "active" | "dormant" | "ended" | "exhausted") {
  if (lifecycle === "active") return "Active";
  if (lifecycle === "dormant") return "Paused";
  if (lifecycle === "ended") return "Ended";
  return "No future occurrence";
}

function taskOwnerExplanation(status: TaskDetailDto["status"]) {
  if (status === "cancelled") return "Restore this task before changing its recurrence.";
  if (status === "completed") return "Reopen this task before restarting recurrence.";
  return "This recurrence cannot be changed right now.";
}

function recurrenceGuidance(editor: Editor, editableOwner: boolean) {
  if (!editor.recurrence) return null;
  if (editor.recurrence.lifecycle === "dormant") {
    return (
      <p>
        {taskOwnerExplanation(editor.task.status)} Missed dormant occurrences are not recreated when the task
        resumes.
      </p>
    );
  }
  if (!editableOwner) return <p>{taskOwnerExplanation(editor.task.status)}</p>;
  if (editor.recurrence.lifecycle !== "ended") {
    return <p>Complete occurrences individually. End recurrence before completing this task.</p>;
  }
  return null;
}
