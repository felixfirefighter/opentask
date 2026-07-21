import type { Dispatch, SetStateAction } from "react";

import { HABIT_TIMEZONE_MAX_CODE_POINTS } from "../application/contracts";
import styles from "./HabitEditorDialog.module.css";
import { habitFieldDescription, habitFieldErrorDescription } from "./habit-form-field-description";
import { habitWeekdayOptions, type HabitFormDraft } from "./habit-form-policy";
import { habitScheduleLabel } from "./habit-view-model";

export function HabitScheduleFields({
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
        <span>Schedule</span>
        <select
          value={draft.scheduleKind}
          onChange={(event) => update("scheduleKind", event.target.value as HabitFormDraft["scheduleKind"])}
        >
          <option value="daily">Every day</option>
          <option value="weekdays">Selected weekdays</option>
          <option value="weekly_target">Target per week</option>
        </select>
      </label>
      {draft.scheduleKind === "weekdays" ? (
        <fieldset
          aria-describedby={errorField === "weekdays" ? errorMessageId : undefined}
          aria-invalid={errorField === "weekdays" || undefined}
        >
          <legend>Weekdays</legend>
          <div className={styles.weekdays}>
            {habitWeekdayOptions.map((option) => (
              <label key={option.value}>
                <input
                  type="checkbox"
                  checked={draft.weekdays.includes(option.value)}
                  onChange={() => update("weekdays", toggleWeekday(draft.weekdays, option.value))}
                />
                <span aria-hidden="true" data-short-weekday>
                  {option.shortLabel}
                </span>
                <span className="sr-only">{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {draft.scheduleKind === "weekly_target" ? (
        <label>
          <span>Successful days per week</span>
          <input
            type="number"
            min="1"
            max="7"
            step="1"
            aria-label="Successful days per week"
            value={draft.targetPerWeek}
            aria-describedby={habitFieldDescription(
              "targetPerWeek",
              "habit-weekly-target-hint",
              errorField,
              errorMessageId,
            )}
            aria-invalid={errorField === "targetPerWeek" || undefined}
            onChange={(event) => update("targetPerWeek", event.target.value)}
          />
          <small id="habit-weekly-target-hint">Choose 1 through 7. Weeks run Monday through Sunday.</small>
        </label>
      ) : null}
      <div className={styles.inlineFields}>
        <label>
          <span>Start date</span>
          <input
            type="date"
            value={draft.startDate}
            aria-describedby={habitFieldErrorDescription("startDate", errorField, errorMessageId)}
            aria-invalid={errorField === "startDate" || undefined}
            onChange={(event) => update("startDate", event.target.value)}
          />
        </label>
        <label>
          <span>
            End date <small>Optional</small>
          </span>
          <input
            type="date"
            value={draft.endDate}
            aria-describedby={habitFieldErrorDescription("endDate", errorField, errorMessageId)}
            aria-invalid={errorField === "endDate" || undefined}
            onChange={(event) => update("endDate", event.target.value)}
          />
        </label>
      </div>
      <label>
        <span>Timezone</span>
        <input
          aria-label="Timezone"
          value={draft.timezone}
          aria-describedby={habitFieldDescription(
            "timezone",
            "habit-timezone-hint",
            errorField,
            errorMessageId,
          )}
          aria-invalid={errorField === "timezone" || undefined}
          onChange={(event) => update("timezone", event.target.value)}
        />
        <small id="habit-timezone-hint">
          Use an IANA name such as Asia/Singapore, up to {HABIT_TIMEZONE_MAX_CODE_POINTS} characters.
        </small>
      </label>
      <p className={styles.preview}>
        <strong>Schedule preview</strong>
        <span>{schedulePreview(draft)}</span>
      </p>
    </>
  );
}

function toggleWeekday(values: readonly number[], value: number): readonly number[] {
  return values.includes(value)
    ? values.filter((weekday) => weekday !== value)
    : [...values, value].sort((left, right) => left - right);
}

function schedulePreview(draft: HabitFormDraft): string {
  try {
    const schedule = {
      timezone: draft.timezone,
      startDate: draft.startDate,
      endDate: draft.endDate || null,
      ...(draft.scheduleKind === "daily"
        ? { kind: "daily" as const, weekdays: null, targetPerWeek: null }
        : draft.scheduleKind === "weekdays"
          ? {
              kind: "weekdays" as const,
              weekdays: draft.weekdays as (1 | 2 | 3 | 4 | 5 | 6 | 7)[],
              targetPerWeek: null,
            }
          : {
              kind: "weekly_target" as const,
              weekdays: null,
              targetPerWeek: Number(draft.targetPerWeek),
            }),
    };
    return `${habitScheduleLabel(schedule)} · ${schedule.timezone}`;
  } catch {
    return "Complete the schedule fields to see how this habit will appear.";
  }
}
