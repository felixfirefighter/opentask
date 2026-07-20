"use client";

import { type FormEvent, useEffect, useRef } from "react";

import {
  RECURRENCE_COUNT_MAX,
  RECURRENCE_COUNT_MIN,
  RECURRENCE_INTERVAL_MAX,
  RECURRENCE_INTERVAL_MIN,
} from "../application/contracts/recurrence-contract";

import {
  recurrenceDraftWithPreset,
  recurrencePresetOptions,
  recurrenceWeekdayOptions,
  toggleRecurrenceWeekday,
  type RecurrenceEndKind,
  type RecurrencePresetKind,
} from "./task-recurrence-form-policy";
import styles from "./TaskRecurrenceEditor.module.css";
import type { useTaskRecurrenceEditorController } from "./use-task-recurrence-editor-controller";

type Editor = ReturnType<typeof useTaskRecurrenceEditorController>;

export function TaskRecurrenceEditorForm({ editor }: Readonly<{ editor: Editor }>) {
  const validationRef = useRef<HTMLParagraphElement>(null);
  const { draft, schedule, timezone } = editor;

  useEffect(() => {
    if (editor.validationError) validationRef.current?.focus();
  }, [editor.validationError]);

  if (!draft || !schedule || !timezone) return null;

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        editor.requestSave();
      }}
    >
      <div className={styles.fieldGrid}>
        <label className={styles.field} htmlFor={`recurrence-preset-${editor.task.id}`}>
          <span>Cadence</span>
          <select
            id={`recurrence-preset-${editor.task.id}`}
            value={draft.presetKind}
            disabled={editor.controlsDisabled}
            onChange={(event) =>
              editor.changeDraft(
                recurrenceDraftWithPreset(
                  draft,
                  event.currentTarget.value as RecurrencePresetKind,
                  schedule,
                  timezone,
                ),
              )
            }
          >
            {recurrencePresetOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field} htmlFor={`recurrence-interval-${editor.task.id}`}>
          <span>Repeat every</span>
          <input
            id={`recurrence-interval-${editor.task.id}`}
            type="number"
            inputMode="numeric"
            min={RECURRENCE_INTERVAL_MIN}
            max={RECURRENCE_INTERVAL_MAX}
            step={1}
            value={draft.interval}
            disabled={editor.controlsDisabled}
            onChange={(event) => editor.changeDraft({ ...draft, interval: event.currentTarget.value })}
          />
        </label>
      </div>

      {draft.presetKind === "weekly" ? (
        <fieldset className={styles.weekdays}>
          <legend>Weekdays</legend>
          <div>
            {recurrenceWeekdayOptions.map((weekday) => (
              <label key={weekday.value}>
                <input
                  type="checkbox"
                  checked={draft.weekdays.includes(weekday.value)}
                  disabled={editor.controlsDisabled}
                  onChange={() =>
                    editor.changeDraft({
                      ...draft,
                      weekdays: toggleRecurrenceWeekday(draft.weekdays, weekday.value),
                    })
                  }
                />
                <span aria-hidden="true">{weekday.shortLabel}</span>
                <span className="sr-only">{weekday.longLabel}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className={styles.fieldGrid}>
        <label className={styles.field} htmlFor={`recurrence-end-${editor.task.id}`}>
          <span>Ends</span>
          <select
            id={`recurrence-end-${editor.task.id}`}
            value={draft.endKind}
            disabled={editor.controlsDisabled}
            onChange={(event) =>
              editor.changeDraft({ ...draft, endKind: event.currentTarget.value as RecurrenceEndKind })
            }
          >
            <option value="never">Never</option>
            <option value="until">On a date</option>
            <option value="count">After a number of occurrences</option>
          </select>
        </label>
        <RecurrenceEndField editor={editor} />
      </div>

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
          disabled={editor.controlsDisabled}
          onClick={editor.cancelEditing}
        >
          Cancel
        </button>
        <button className="primary-button" type="submit" disabled={editor.controlsDisabled}>
          {editor.mutation.isPending
            ? "Saving recurrence…"
            : editor.recurrence
              ? "Save and restart"
              : "Add recurrence"}
        </button>
      </div>
    </form>
  );
}

function RecurrenceEndField({ editor }: Readonly<{ editor: Editor }>) {
  const draft = editor.draft;
  if (!draft || draft.endKind === "never") return null;
  if (draft.endKind === "until") {
    return (
      <label className={styles.field} htmlFor={`recurrence-until-${editor.task.id}`}>
        <span>Inclusive end date</span>
        <input
          id={`recurrence-until-${editor.task.id}`}
          type="date"
          value={draft.untilDate}
          disabled={editor.controlsDisabled}
          onChange={(event) => editor.changeDraft({ ...draft, untilDate: event.currentTarget.value })}
        />
      </label>
    );
  }
  return (
    <label className={styles.field} htmlFor={`recurrence-count-${editor.task.id}`}>
      <span>Occurrences</span>
      <input
        id={`recurrence-count-${editor.task.id}`}
        type="number"
        inputMode="numeric"
        min={RECURRENCE_COUNT_MIN}
        max={RECURRENCE_COUNT_MAX}
        step={1}
        value={draft.count}
        disabled={editor.controlsDisabled}
        onChange={(event) => editor.changeDraft({ ...draft, count: event.currentTarget.value })}
      />
    </label>
  );
}
