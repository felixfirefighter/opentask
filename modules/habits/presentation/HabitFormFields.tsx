import type { Dispatch, SetStateAction } from "react";

import { HabitDefinitionFields } from "./HabitDefinitionFields";
import styles from "./HabitEditorDialog.module.css";
import type { HabitFormDraft } from "./habit-form-policy";
import { HabitScheduleFields } from "./HabitScheduleFields";

export function HabitFormFields({
  disabled = false,
  draft,
  errorField,
  errorMessageId,
  setDraft,
}: Readonly<{
  disabled?: boolean;
  draft: HabitFormDraft;
  errorField: keyof HabitFormDraft | null;
  errorMessageId?: string | undefined;
  setDraft: Dispatch<SetStateAction<HabitFormDraft>>;
}>) {
  return (
    <fieldset className={styles.fields} disabled={disabled}>
      <legend className="sr-only">Habit fields</legend>
      <HabitDefinitionFields
        draft={draft}
        errorField={errorField}
        errorMessageId={errorMessageId}
        setDraft={setDraft}
      />
      <HabitScheduleFields
        draft={draft}
        errorField={errorField}
        errorMessageId={errorMessageId}
        setDraft={setDraft}
      />
    </fieldset>
  );
}
