"use client";

import type { FormEvent } from "react";

import type { ReminderDraft, ReminderKind } from "./reminder-form-policy";
import styles from "./TaskReminderPanel.module.css";

export function TaskReminderForm({
  allowedKinds,
  conflict,
  latestReloaded,
  draft,
  disabled,
  errorMessage,
  interpretation,
  pending,
  taskId,
  onCancel,
  onChange,
  onReloadLatest,
  onSave,
}: Readonly<{
  allowedKinds: readonly ReminderKind[];
  conflict: boolean;
  latestReloaded: boolean;
  draft: ReminderDraft;
  disabled: boolean;
  errorMessage: string | null;
  interpretation: Readonly<{ valid: boolean; message?: string; summary?: string }> | null;
  pending: boolean;
  taskId: string;
  onCancel: () => void;
  onChange: (draft: ReminderDraft) => void;
  onReloadLatest: () => void;
  onSave: () => void;
}>) {
  return (
    <form
      className={styles.form}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        onSave();
      }}
    >
      {allowedKinds.length > 1 ? (
        <fieldset className={styles.kindChoices} disabled={disabled || pending}>
          <legend>Reminder type</legend>
          <label>
            <input
              type="radio"
              name={`reminder-kind-${taskId}`}
              checked={draft.kind === "absolute"}
              onChange={() => onChange({ ...draft, kind: "absolute" })}
            />
            Specific time
          </label>
          <label>
            <input
              type="radio"
              name={`reminder-kind-${taskId}`}
              checked={draft.kind === "relative_start"}
              onChange={() => onChange({ ...draft, kind: "relative_start" })}
            />
            Before task start
          </label>
        </fieldset>
      ) : null}

      {draft.kind === "absolute" ? (
        <label className={styles.field}>
          <span>Reminder date and time</span>
          <input
            type="datetime-local"
            value={draft.absoluteLocal}
            autoFocus
            disabled={disabled || pending}
            required
            onChange={(event) => onChange({ ...draft, absoluteLocal: event.target.value })}
          />
        </label>
      ) : (
        <label className={styles.field}>
          <span>Minutes before start</span>
          <input
            type="number"
            min={0}
            max={10_080}
            step={1}
            value={draft.offsetMinutes}
            autoFocus
            disabled={disabled || pending}
            required
            inputMode="numeric"
            onChange={(event) => onChange({ ...draft, offsetMinutes: event.target.value })}
          />
        </label>
      )}

      <label className={styles.enabledChoice}>
        <input
          type="checkbox"
          checked={draft.enabled}
          disabled={disabled || pending}
          onChange={(event) => onChange({ ...draft, enabled: event.target.checked })}
        />
        Enable this reminder after saving
      </label>

      <p className={interpretation?.valid ? styles.interpretation : styles.validation} role="status">
        {interpretation?.valid ? `Interpreted as: ${interpretation.summary}` : interpretation?.message}
      </p>
      {errorMessage ? (
        <div className={styles.conflictState}>
          <p className={styles.error} role="alert">
            {errorMessage}
          </p>
          <button
            type="button"
            className="quiet-button"
            disabled={disabled || pending}
            onClick={onReloadLatest}
          >
            {conflict ? "Load latest reminder" : "Check saved reminder"}
          </button>
        </div>
      ) : null}
      {latestReloaded ? (
        <p className={styles.interpretation} role="status">
          Latest reminder loaded. Your draft is preserved; review it before saving again.
        </p>
      ) : null}

      <div className={styles.formActions}>
        <button type="button" className="quiet-button" disabled={pending} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className="primary-button"
          disabled={disabled || pending || !interpretation?.valid}
        >
          {pending ? "Saving reminder…" : "Save reminder"}
        </button>
      </div>
    </form>
  );
}
