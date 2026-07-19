import type { PlannerInput } from "../application/contracts";

import { inputWindowLabel } from "./planner-presentation-format";
import styles from "./PlannerDescribeStep.module.css";

export function PlannerConstraintFields({
  draft,
  disabled,
  onChange,
}: Readonly<{
  draft: PlannerInput;
  disabled: boolean;
  onChange: (input: PlannerInput) => void;
}>) {
  return (
    <section className={styles.card} aria-labelledby="planning-constraints-heading">
      <div className={styles.cardHeading}>
        <div>
          <p className="eyebrow">Constraints</p>
          <h2 id="planning-constraints-heading">Set the available work window</h2>
        </div>
      </div>
      <div className={styles.fieldGrid}>
        <InputField
          label="Planning date"
          type="date"
          value={draft.planningDate}
          disabled={disabled}
          onChange={(planningDate) => onChange({ ...draft, planningDate })}
        />
        <InputField
          label="Window starts"
          type="time"
          value={draft.workWindow.start}
          disabled={disabled}
          onChange={(start) => onChange({ ...draft, workWindow: { ...draft.workWindow, start } })}
        />
        <InputField
          label="Window ends"
          type="time"
          value={draft.workWindow.end}
          disabled={disabled}
          onChange={(end) => onChange({ ...draft, workWindow: { ...draft.workWindow, end } })}
        />
        <NumberField
          label="Default duration"
          suffix="minutes"
          value={draft.defaultDurationMinutes}
          min={5}
          max={480}
          disabled={disabled}
          onChange={(defaultDurationMinutes) => onChange({ ...draft, defaultDurationMinutes })}
        />
        <NumberField
          label="Buffer"
          suffix="minutes"
          value={draft.bufferMinutes}
          min={0}
          max={120}
          disabled={disabled}
          onChange={(bufferMinutes) => onChange({ ...draft, bufferMinutes })}
        />
        <div className={styles.timeZoneSummary}>
          <strong>Timezone</strong>
          <span>{draft.timeZone}</span>
        </div>
      </div>
      <p className={styles.windowSummary} aria-live="polite">
        <strong>Interpreted window:</strong> {inputWindowLabel(draft)}
      </p>
    </section>
  );
}

function InputField(
  props: Readonly<{
    label: string;
    type: "date" | "time";
    value: string;
    disabled: boolean;
    onChange: (value: string) => void;
  }>,
) {
  return (
    <label className={styles.field}>
      <span>{props.label}</span>
      <input
        type={props.type}
        required
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function NumberField(
  props: Readonly<{
    label: string;
    suffix: string;
    value: number;
    min: number;
    max: number;
    disabled: boolean;
    onChange: (value: number) => void;
  }>,
) {
  return (
    <label className={styles.field}>
      <span>{props.label}</span>
      <span className={styles.numberInput}>
        <input
          type="number"
          step={5}
          value={props.value}
          min={props.min}
          max={props.max}
          disabled={props.disabled}
          onChange={(event) => props.onChange(Number(event.currentTarget.value))}
        />
        <small>{props.suffix}</small>
      </span>
    </label>
  );
}
