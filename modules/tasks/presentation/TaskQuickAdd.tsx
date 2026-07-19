"use client";

import { Plus } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";

import { useOnlineStatus } from "@/shared/presentation";

import { isTaskApiError } from "./data/task-api-request";
import { useCreateTaskMutation } from "./data/use-task-editor-mutations";
import styles from "./TaskQuickAdd.module.css";

export function TaskQuickAdd({
  listId,
  listName,
  sectionId = null,
}: Readonly<{ listId: string; listName: string; sectionId?: string | null }>) {
  const inputId = useId();
  const [title, setTitle] = useState("");
  const [requestPending, setRequestPending] = useState(false);
  const draftResourceId = useRef<string | null>(null);
  const requestInFlight = useRef(false);
  const titleRef = useRef("");
  const online = useOnlineStatus();
  const create = useCreateTaskMutation();
  const createPending = requestPending || create.isPending;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle || !online || requestInFlight.current || create.isPending) return;
    const submittedTitle = title;
    draftResourceId.current ??= crypto.randomUUID();
    const resourceId = draftResourceId.current;
    requestInFlight.current = true;
    setRequestPending(true);
    try {
      await create.mutateAsync({
        resourceId,
        input: {
          title: cleanTitle,
          descriptionMd: "",
          priority: "none",
          listId,
          sectionId,
          parentTaskId: null,
          placement: { kind: "start" },
        },
      });
      if (draftResourceId.current === resourceId && titleRef.current === submittedTitle) {
        draftResourceId.current = null;
        titleRef.current = "";
        setTitle("");
      }
    } catch {
      // React Query exposes the error below while the draft remains in the field.
    } finally {
      requestInFlight.current = false;
      setRequestPending(false);
    }
  }

  const errorMessage = create.error
    ? isTaskApiError(create.error)
      ? create.error.message
      : "The task was not added. Your title is still here so you can try again."
    : null;

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
            value={title}
            onChange={(event) => {
              if (requestInFlight.current || create.isPending) return;
              const nextTitle = event.target.value;
              titleRef.current = nextTitle;
              setTitle(nextTitle);
              draftResourceId.current = null;
              create.reset();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && event.shiftKey) event.preventDefault();
              if (event.key === "Escape") {
                if (requestInFlight.current || create.isPending) return;
                titleRef.current = "";
                setTitle("");
                draftResourceId.current = null;
                create.reset();
              }
            }}
            placeholder="Add a task…"
            disabled={!online || createPending}
            aria-describedby={!online ? `${inputId}-offline` : errorMessage ? `${inputId}-error` : undefined}
          />
          <span className={styles.destination} title={`Add to ${listName}`}>
            {listName}
          </span>
          <button
            className="primary-button"
            type="submit"
            disabled={!online || createPending || title.trim().length === 0}
          >
            {createPending ? "Adding…" : "Add task"}
          </button>
        </div>
      </form>
      {!online && (
        <p className={styles.explanation} id={`${inputId}-offline`}>
          Reconnect to add tasks.
        </p>
      )}
      {errorMessage && (
        <p className={styles.error} id={`${inputId}-error`} role="alert">
          {errorMessage}
        </p>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {create.isSuccess ? "Task added" : ""}
      </span>
    </div>
  );
}
