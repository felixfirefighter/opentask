"use client";

import { Check, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";

import type { TaskDetailDto } from "../application/contracts";
import { useUpdateTaskMutation } from "./data/use-task-editor-mutations";
import { useTaskDraftGuard } from "./task-draft-guard";
import { useTaskConflictRecovery } from "./use-task-conflict-recovery";
import styles from "./TaskTitleEditor.module.css";

export function TaskTitleEditor({
  disabled,
  headingId,
  task,
}: Readonly<{ disabled: boolean; headingId: string; task: TaskDetailDto }>) {
  const [draft, setDraft] = useState(task.title);
  const [dirty, setDirty] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const update = useUpdateTaskMutation();

  const visibleDraft = dirty || update.isError ? draft : task.title;
  const recovery = useTaskConflictRecovery(task, update.error);
  const authoritativeTask = recovery.needsLatest ? recovery.latestTask : task;
  const draftGuard = useTaskDraftGuard(task.id, "title", dirty || update.isError, update.isPending);

  async function save(force = false) {
    const title = visibleDraft.trim();
    if (
      disabled ||
      update.isPending ||
      !title ||
      (recovery.needsLatest && (!force || !recovery.latestReady))
    ) {
      return;
    }
    if (title === authoritativeTask.title) {
      setDraft(authoritativeTask.title);
      setDirty(false);
      update.reset();
      return;
    }
    if (!draftGuard.beginWrite()) return;
    try {
      await update.mutateAsync({
        taskId: task.id,
        listId: authoritativeTask.listId,
        input: { expectedVersion: authoritativeTask.version, patch: { title } },
      });
      setDraft(title);
      setDirty(false);
    } catch {
      inputRef.current?.focus();
    } finally {
      draftGuard.finishWrite();
    }
  }

  return (
    <section className={styles.editor} aria-labelledby={headingId}>
      <label className={styles.label} htmlFor={`${headingId}-input`}>
        Task title
      </label>
      <textarea
        ref={inputRef}
        id={`${headingId}-input`}
        className={styles.input}
        rows={2}
        maxLength={500}
        value={visibleDraft}
        disabled={disabled || update.isPending}
        onChange={(event) => {
          setDraft(event.target.value);
          setDirty(true);
        }}
        onBlur={() => void save()}
      />
      <h1 id={headingId} className="sr-only" tabIndex={-1} data-route-focus>
        {task.title}
      </h1>
      <div className={styles.saveState} role="status" aria-live="polite">
        {update.isPending ? (
          <>
            <RefreshCw size={13} aria-hidden="true" /> Saving title…
          </>
        ) : update.isSuccess && !dirty ? (
          <>
            <Check size={13} aria-hidden="true" /> Title saved
          </>
        ) : dirty ? (
          "Title has unsaved changes"
        ) : (
          "Title is saved"
        )}
      </div>
      {update.error && (
        <div className={styles.conflict} role="alert">
          <strong>
            {recovery.conflict
              ? "This title changed elsewhere."
              : recovery.unconfirmed
                ? "The title update is unconfirmed."
                : "The title was not saved."}
          </strong>
          <p>
            {recovery.unconfirmed
              ? "Your text is preserved while the latest saved title is checked."
              : "Your text is preserved. Review the latest title before overwriting it."}
          </p>
          {recovery.needsLatest ? (
            <p>
              {recovery.latestReady
                ? `Latest saved title: “${recovery.latestTask.title}”`
                : recovery.loadingLatest
                  ? "Loading the latest saved title…"
                  : "The latest saved title could not be loaded."}
            </p>
          ) : null}
          <div className={styles.conflictActions}>
            <button
              type="button"
              className="secondary-button"
              disabled={recovery.needsLatest && !recovery.latestReady}
              onClick={() => {
                setDraft(authoritativeTask.title);
                setDirty(false);
                update.reset();
              }}
            >
              Use latest
            </button>
            <button type="button" className="secondary-button" onClick={() => inputRef.current?.focus()}>
              Keep editing
            </button>
            {recovery.latestUnavailable ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => void recovery.refetchLatest()}
              >
                Refresh latest
              </button>
            ) : null}
            <button
              type="button"
              className="primary-button"
              disabled={recovery.needsLatest && !recovery.latestReady}
              onClick={() => void save(true)}
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
