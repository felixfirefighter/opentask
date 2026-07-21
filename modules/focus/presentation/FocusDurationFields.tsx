import {
  FOCUS_BREAK_SECONDS_MAX,
  FOCUS_BREAK_SECONDS_MIN,
  FOCUS_PLANNED_SECONDS_MAX,
  FOCUS_PLANNED_SECONDS_MIN,
} from "../application/contracts";
import styles from "./FocusDurationFields.module.css";

export function FocusDurationFields({
  breakSeconds,
  disabled,
  focusSeconds,
  onBreakChange,
  onFocusChange,
}: Readonly<{
  breakSeconds: number;
  disabled: boolean;
  focusSeconds: number;
  onBreakChange: (seconds: number) => void;
  onFocusChange: (seconds: number) => void;
}>) {
  return (
    <fieldset className={styles.fields} disabled={disabled}>
      <legend>Plan this run</legend>
      <DurationField
        label="Focus length"
        maxSeconds={FOCUS_PLANNED_SECONDS_MAX}
        minSeconds={FOCUS_PLANNED_SECONDS_MIN}
        seconds={focusSeconds}
        onChange={onFocusChange}
      />
      <DurationField
        label="Break length"
        maxSeconds={FOCUS_BREAK_SECONDS_MAX}
        minSeconds={FOCUS_BREAK_SECONDS_MIN}
        seconds={breakSeconds}
        onChange={onBreakChange}
      />
    </fieldset>
  );
}

function DurationField({
  label,
  maxSeconds,
  minSeconds,
  onChange,
  seconds,
}: Readonly<{
  label: string;
  maxSeconds: number;
  minSeconds: number;
  onChange: (seconds: number) => void;
  seconds: number;
}>) {
  return (
    <label>
      <span>{label}</span>
      <span className={styles.inputWrap}>
        <input
          aria-label={`${label} in minutes`}
          max={maxSeconds / 60}
          min={minSeconds / 60}
          step={1}
          type="number"
          value={seconds / 60}
          onChange={(event) => {
            const minutes = Number(event.currentTarget.value);
            const nextSeconds = minutes * 60;
            if (Number.isInteger(minutes) && nextSeconds >= minSeconds && nextSeconds <= maxSeconds) {
              onChange(nextSeconds);
            }
          }}
        />
        <span aria-hidden="true">min</span>
      </span>
    </label>
  );
}
