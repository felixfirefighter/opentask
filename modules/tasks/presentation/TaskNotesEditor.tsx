"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { TaskDetailDto } from "../application/contracts";
import { useUpdateTaskMutation } from "./data/use-task-editor-mutations";
import { useTaskDraftGuard } from "./task-draft-guard";
import { useTaskConflictRecovery } from "./use-task-conflict-recovery";
import styles from "./TaskNotesEditor.module.css";

export function TaskNotesEditor({ disabled, task }: Readonly<{ disabled: boolean; task: TaskDetailDto }>) {
  const [draft, setDraft] = useState(task.descriptionMd);
  const [mode, setMode] = useState<"edit" | "preview">(task.descriptionMd ? "preview" : "edit");
  const [dirty, setDirty] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const update = useUpdateTaskMutation();

  const visibleDraft = dirty || update.isError ? draft : task.descriptionMd;
  const recovery = useTaskConflictRecovery(task, update.error);
  const authoritativeTask = recovery.conflict ? recovery.latestTask : task;
  const draftGuard = useTaskDraftGuard(task.id, "notes", dirty || update.isError, update.isPending);

  async function save(force = false) {
    if (disabled || update.isPending || (recovery.conflict && (!force || !recovery.latestReady))) {
      return;
    }
    if (visibleDraft === authoritativeTask.descriptionMd) {
      setDraft(authoritativeTask.descriptionMd);
      setDirty(false);
      update.reset();
      return;
    }
    if (!draftGuard.beginWrite()) return;
    try {
      await update.mutateAsync({
        taskId: task.id,
        listId: authoritativeTask.listId,
        input: {
          expectedVersion: authoritativeTask.version,
          patch: { descriptionMd: visibleDraft },
        },
      });
      setDirty(false);
      setMode("preview");
    } catch {
      // Keep the Markdown draft visible for conflict recovery.
    } finally {
      draftGuard.finishWrite();
    }
  }

  return (
    <section className={styles.group} aria-labelledby={`notes-${task.id}`}>
      <div className={styles.heading}>
        <h2 id={`notes-${task.id}`}>Notes</h2>
        <div className={styles.tabs} aria-label="Notes view">
          <button
            type="button"
            aria-pressed={mode === "edit"}
            disabled={update.isPending}
            onClick={() => setMode("edit")}
          >
            Edit
          </button>
          <button
            type="button"
            aria-pressed={mode === "preview"}
            disabled={update.isPending}
            onClick={() => setMode("preview")}
          >
            Preview
          </button>
        </div>
      </div>
      {mode === "edit" ? (
        <>
          <label htmlFor={`notes-input-${task.id}`}>Markdown description</label>
          <textarea
            ref={inputRef}
            id={`notes-input-${task.id}`}
            value={visibleDraft}
            maxLength={20_000}
            rows={8}
            disabled={disabled || update.isPending}
            placeholder="Add notes using Markdown…"
            onChange={(event) => {
              setDraft(event.target.value);
              setDirty(true);
            }}
          />
          <div className={styles.saveRow}>
            <span role="status" aria-live="polite">
              {update.isPending ? "Saving notes…" : dirty ? "Notes have unsaved changes" : "Notes are saved"}
            </span>
            <button
              className="secondary-button"
              type="button"
              disabled={disabled || !dirty || update.isPending}
              onClick={() => void save()}
            >
              {update.isPending ? "Saving…" : "Save notes"}
            </button>
          </div>
        </>
      ) : visibleDraft ? (
        <div className={styles.preview} data-testid="markdown-preview">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{visibleDraft}</ReactMarkdown>
        </div>
      ) : (
        <button className={styles.empty} type="button" disabled={disabled} onClick={() => setMode("edit")}>
          Add notes
        </button>
      )}
      {update.error && (
        <div className={styles.error} role="alert">
          <strong>{recovery.conflict ? "These notes changed elsewhere." : "Notes were not saved."}</strong>
          <p>Your Markdown draft is preserved.</p>
          {recovery.conflict ? (
            recovery.latestReady ? (
              <details className={styles.latest}>
                <summary>Review latest saved notes</summary>
                <pre>{recovery.latestTask.descriptionMd || "No saved notes."}</pre>
              </details>
            ) : (
              <p>
                {recovery.loadingLatest
                  ? "Loading the latest saved notes…"
                  : "The latest saved notes could not be loaded."}
              </p>
            )
          ) : null}
          <div>
            <button
              className="quiet-button"
              type="button"
              disabled={recovery.conflict && !recovery.latestReady}
              onClick={() => {
                setDraft(authoritativeTask.descriptionMd);
                setDirty(false);
                update.reset();
              }}
            >
              Use latest
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setMode("edit");
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
            >
              Keep editing
            </button>
            {recovery.latestUnavailable ? (
              <button
                className="secondary-button"
                type="button"
                onClick={() => void recovery.refetchLatest()}
              >
                Refresh latest
              </button>
            ) : null}
            <button
              className="primary-button"
              type="button"
              disabled={recovery.conflict && !recovery.latestReady}
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
