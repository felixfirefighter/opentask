import type { Dispatch, FormEventHandler, RefObject, SetStateAction } from "react";

import { Button } from "@/shared/presentation";

import { HABIT_DECIMAL_MAX, HABIT_NOTE_MAX_CODE_POINTS, type HabitGoal } from "../application/contracts";
import type { HabitDayDraft, HabitDayValidation } from "./habit-day-editor-policy";
import styles from "./HabitDayEditorDialog.module.css";

export function HabitDayEditorForm({
  displayedError,
  draft,
  errorId,
  goal,
  onCancel,
  onDraftChange,
  onReviewLatest,
  onSubmit,
  pending,
  reviewRequired,
  reviewing,
  saveDisabled,
  summaryRef,
  validation,
  writeDisabled,
}: Readonly<{
  displayedError: string | null;
  draft: HabitDayDraft;
  errorId: string;
  goal: HabitGoal;
  onCancel: () => void;
  onDraftChange: Dispatch<SetStateAction<HabitDayDraft>>;
  onReviewLatest?: (() => void | Promise<void>) | undefined;
  onSubmit: FormEventHandler<HTMLFormElement>;
  pending: boolean;
  reviewRequired: boolean;
  reviewing: boolean;
  saveDisabled: boolean;
  summaryRef: RefObject<HTMLDivElement | null>;
  validation: HabitDayValidation | null;
  writeDisabled: boolean;
}>) {
  return (
    <form onSubmit={onSubmit} noValidate>
      {displayedError ? (
        <div className={styles.error} id={errorId} ref={summaryRef} role="alert" tabIndex={-1}>
          <span>{displayedError}</span>
          {reviewRequired && onReviewLatest ? (
            <Button
              type="button"
              variant="secondary"
              disabled={reviewing || writeDisabled}
              onClick={onReviewLatest}
            >
              {reviewing ? "Loading latest…" : "Review latest in this form"}
            </Button>
          ) : null}
        </div>
      ) : null}
      {writeDisabled ? (
        <p className={styles.writeDisabled} role="status">
          Reconnect before saving. You can still review this draft or close the editor.
        </p>
      ) : null}
      <fieldset>
        <legend>Day status</legend>
        <label>
          <input
            type="radio"
            name="habit-day-state"
            checked={draft.state === "completed"}
            onChange={() => onDraftChange({ ...draft, state: "completed" })}
          />{" "}
          Completed
        </label>
        <label>
          <input
            type="radio"
            name="habit-day-state"
            checked={draft.state === "skipped"}
            onChange={() => onDraftChange({ ...draft, state: "skipped" })}
          />{" "}
          Skip this day
        </label>
        <label>
          <input
            type="radio"
            name="habit-day-state"
            checked={draft.state === "unachieved"}
            onChange={() => onDraftChange({ ...draft, state: "unachieved" })}
          />{" "}
          Mark unachieved
        </label>
      </fieldset>
      {goal.goalKind === "quantity" && draft.state === "completed" ? (
        <label>
          <span>Quantity ({goal.unit})</span>
          <input
            type="number"
            min="0"
            max={HABIT_DECIMAL_MAX}
            step="0.001"
            inputMode="decimal"
            aria-label={`Quantity (${goal.unit})`}
            value={draft.quantity}
            aria-describedby={["habit-day-quantity-hint", validation?.field === "quantity" ? errorId : null]
              .filter(Boolean)
              .join(" ")}
            aria-invalid={validation?.field === "quantity" || undefined}
            onChange={(event) => onDraftChange({ ...draft, quantity: event.target.value })}
          />
          <small id="habit-day-quantity-hint">
            Target: {goal.targetValue} {goal.unit}. Maximum {HABIT_DECIMAL_MAX}.
          </small>
        </label>
      ) : null}
      <label>
        <span>
          Note <small>Optional</small>
        </span>
        <textarea
          aria-label="Note (optional)"
          rows={4}
          value={draft.note}
          aria-describedby={["habit-day-note-hint", validation?.field === "note" ? errorId : null]
            .filter(Boolean)
            .join(" ")}
          aria-invalid={validation?.field === "note" || undefined}
          onChange={(event) => onDraftChange({ ...draft, note: event.target.value })}
        />
        <small id="habit-day-note-hint">Up to {HABIT_NOTE_MAX_CODE_POINTS} characters.</small>
      </label>
      <footer>
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saveDisabled}>
          {pending ? "Saving check-in…" : "Save check-in"}
        </Button>
      </footer>
    </form>
  );
}
