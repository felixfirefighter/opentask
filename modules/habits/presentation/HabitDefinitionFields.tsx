import type { Dispatch, SetStateAction } from "react";

import {
  HABIT_DECIMAL_MAX,
  HABIT_ICON_MAX_CODE_POINTS,
  HABIT_TITLE_MAX_CODE_POINTS,
  HABIT_UNIT_MAX_CODE_POINTS,
} from "../application/contracts";
import styles from "./HabitEditorDialog.module.css";
import { habitFieldDescription } from "./habit-form-field-description";
import { habitColorOptions, type HabitFormDraft } from "./habit-form-policy";

export function HabitDefinitionFields({
  draft,
  errorField,
  errorMessageId,
  setDraft,
}: Readonly<{
  draft: HabitFormDraft;
  errorField: keyof HabitFormDraft | null;
  errorMessageId?: string | undefined;
  setDraft: Dispatch<SetStateAction<HabitFormDraft>>;
}>) {
  const update = <Key extends keyof HabitFormDraft>(key: Key, value: HabitFormDraft[Key]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <>
      <label>
        <span>Title</span>
        <input
          autoFocus
          autoComplete="off"
          aria-label="Title"
          value={draft.title}
          aria-describedby={habitFieldDescription("title", "habit-title-hint", errorField, errorMessageId)}
          aria-invalid={errorField === "title" || undefined}
          onChange={(event) => update("title", event.target.value)}
        />
        <small id="habit-title-hint">Up to {HABIT_TITLE_MAX_CODE_POINTS} characters.</small>
      </label>
      <div className={styles.inlineFields}>
        <label>
          <span>Icon or emoji</span>
          <input
            autoComplete="off"
            aria-label="Icon or emoji"
            value={draft.icon}
            aria-describedby={habitFieldDescription("icon", "habit-icon-hint", errorField, errorMessageId)}
            aria-invalid={errorField === "icon" || undefined}
            onChange={(event) => update("icon", event.target.value)}
          />
          <small id="habit-icon-hint">Up to {HABIT_ICON_MAX_CODE_POINTS} characters.</small>
        </label>
        <label>
          <span>Category</span>
          <select
            value={draft.colorToken}
            onChange={(event) => update("colorToken", event.target.value as HabitFormDraft["colorToken"])}
          >
            {habitColorOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset>
        <legend>Goal</legend>
        <div className={styles.choiceRow}>
          <label>
            <input
              type="radio"
              name="habit-goal-kind"
              checked={draft.goalKind === "boolean"}
              onChange={() => update("goalKind", "boolean")}
            />
            Check in once
          </label>
          <label>
            <input
              type="radio"
              name="habit-goal-kind"
              checked={draft.goalKind === "quantity"}
              onChange={() => update("goalKind", "quantity")}
            />
            Track a quantity
          </label>
        </div>
      </fieldset>
      {draft.goalKind === "quantity" ? (
        <div className={styles.inlineFields}>
          <label>
            <span>Target quantity</span>
            <input
              type="number"
              min="0.001"
              max={HABIT_DECIMAL_MAX}
              step="0.001"
              inputMode="decimal"
              aria-label="Target quantity"
              value={draft.targetValue}
              aria-describedby={habitFieldDescription(
                "targetValue",
                "habit-target-hint",
                errorField,
                errorMessageId,
              )}
              aria-invalid={errorField === "targetValue" || undefined}
              onChange={(event) => update("targetValue", event.target.value)}
            />
            <small id="habit-target-hint">From 0.001 through {HABIT_DECIMAL_MAX}.</small>
          </label>
          <label>
            <span>Unit</span>
            <input
              aria-label="Unit"
              value={draft.unit}
              aria-describedby={habitFieldDescription("unit", "habit-unit-hint", errorField, errorMessageId)}
              aria-invalid={errorField === "unit" || undefined}
              onChange={(event) => update("unit", event.target.value)}
            />
            <small id="habit-unit-hint">Up to {HABIT_UNIT_MAX_CODE_POINTS} characters.</small>
          </label>
        </div>
      ) : null}
    </>
  );
}
