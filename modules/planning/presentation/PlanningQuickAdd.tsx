"use client";

import { Clock3, Pencil, Plus, X } from "lucide-react";
import { type FormEvent, type Ref, useId } from "react";

import { Button } from "@/shared/presentation";

import type { QuickAddModel } from "./planning-screen-model";
import styles from "./PlanningQuickAdd.module.css";

type PlanningQuickAddProps = Readonly<{
  model: QuickAddModel;
  disabled?: boolean | undefined;
  inputRef?: Ref<HTMLInputElement> | undefined;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onEditToken?: ((tokenId: string) => void) | undefined;
  onRemoveToken?: ((tokenId: string) => void) | undefined;
}>;

export function PlanningQuickAdd({
  disabled = false,
  inputRef,
  model,
  onChange,
  onEditToken,
  onRemoveToken,
  onSubmit,
}: PlanningQuickAddProps) {
  const inputId = useId();
  const explanationId = `${inputId}-explanation`;
  const errorId = `${inputId}-error`;
  const describedBy = model.errorMessage ? `${explanationId} ${errorId}` : explanationId;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!disabled && !model.submitting && model.value.trim()) onSubmit(model.value);
  }

  return (
    <form className={styles.composer} onSubmit={submit} aria-describedby={describedBy}>
      <label htmlFor={inputId} className={styles.label}>
        Add a task
      </label>
      <div className={styles.inputRow}>
        <Plus size={18} aria-hidden="true" />
        <input
          id={inputId}
          ref={inputRef}
          value={model.value}
          disabled={disabled || model.submitting || model.retryLocked}
          placeholder={model.placeholder ?? "Add a task…"}
          autoComplete="off"
          onChange={(event) => onChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || disabled || model.submitting || model.retryLocked) return;
            event.preventDefault();
            const token = model.tokens?.[0];
            if (token && onRemoveToken) onRemoveToken(token.id);
            else onChange("");
          }}
        />
        <Button
          type="submit"
          disabled={disabled || model.submitting || !model.value.trim()}
          aria-label={model.submitting ? "Adding task" : "Add task"}
        >
          {model.submitting ? "Adding…" : "Add task"}
        </Button>
      </div>
      <div className={styles.confirmationRow}>
        <span className={styles.destination}>
          <Clock3 size={14} aria-hidden="true" /> {model.destinationLabel}
        </span>
        {(model.tokens ?? []).map((token) => (
          <span className={styles.token} key={token.id}>
            {onEditToken ? (
              <button
                type="button"
                disabled={disabled || model.submitting || model.retryLocked}
                aria-label={`Edit recognized value ${token.label}`}
                onClick={() => onEditToken(token.id)}
              >
                <Pencil size={12} aria-hidden="true" /> {token.label}
              </button>
            ) : (
              <span>{token.label}</span>
            )}
            {onRemoveToken ? (
              <button
                type="button"
                disabled={disabled || model.submitting || model.retryLocked}
                aria-label={`Clear recognized value ${token.label}`}
                onClick={() => onRemoveToken(token.id)}
              >
                <X size={13} aria-hidden="true" />
              </button>
            ) : null}
          </span>
        ))}
      </div>
      {(model.tokens ?? []).flatMap((token) =>
        token.warning ? (
          <p className={styles.warning} key={`${token.id}-warning`} role="status">
            {token.warning}
          </p>
        ) : (
          []
        ),
      )}
      {model.errorMessage ? (
        <p className={styles.error} id={errorId} role="alert">
          {model.errorMessage}
        </p>
      ) : null}
      <p className={styles.explanation} id={explanationId}>
        {disabled
          ? "Task creation is unavailable until this view can write again."
          : "Recognized dates stay visible and editable before the task is saved."}
      </p>
      <span className="sr-only" role="status" aria-live="polite">
        {model.announcement}
      </span>
    </form>
  );
}
