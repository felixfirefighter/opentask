import { useId } from "react";

import type { FocusModeView } from "./focus-screen-model";
import styles from "./FocusModeSelector.module.css";

export function FocusModeSelector({
  disabled,
  mode,
  onChange,
}: Readonly<{
  disabled: boolean;
  mode: FocusModeView;
  onChange: (mode: FocusModeView) => void;
}>) {
  const name = useId();
  return (
    <fieldset className={styles.selector}>
      <legend className="sr-only">Timer mode</legend>
      {(["pomodoro", "stopwatch"] as const).map((option) => (
        <label key={option}>
          <input
            checked={mode === option}
            disabled={disabled}
            name={name}
            type="radio"
            value={option}
            onChange={() => onChange(option)}
          />
          <span>{option === "pomodoro" ? "Pomodoro" : "Stopwatch"}</span>
        </label>
      ))}
    </fieldset>
  );
}
