import type { UserPreferences, UserPreferencesPatch } from "../application/preferences-contract";

import styles from "./SettingsScreen.module.css";
import { CardActions } from "./DateTimePreferencesCard";
import type { SaveState } from "./usePreferencesEditor";

const themes = [
  { value: "system", label: "System", hint: "Follow this device" },
  { value: "light", label: "Light", hint: "Warm neutral canvas" },
  { value: "dark", label: "Dark", hint: "Low-light workspace" },
] as const;

export function AppearancePreferencesCard({
  preferences,
  online,
  saveState,
  message,
  onChange,
  onSave,
  onReviewLatest,
}: {
  preferences: UserPreferences;
  online: boolean;
  saveState: SaveState;
  message: string | undefined;
  onChange(patch: UserPreferencesPatch): void;
  onSave(): void;
  onReviewLatest(): void;
}) {
  return (
    <section className={styles.card} aria-labelledby="appearance-title">
      <div className={styles.cardHeading}>
        <div>
          <p className="eyebrow">Workspace</p>
          <h2 id="appearance-title">Appearance</h2>
        </div>
      </div>

      <fieldset className={styles.themeFieldset}>
        <legend>Theme</legend>
        <div className={styles.themeGrid}>
          {themes.map((theme) => (
            <label key={theme.value} className={styles.themeChoice}>
              <input
                type="radio"
                name="theme"
                value={theme.value}
                checked={preferences.theme === theme.value}
                onChange={() => onChange({ theme: theme.value })}
              />
              <span className={styles.themeSample} data-theme-preview={theme.value} aria-hidden="true">
                <i />
                <b />
              </span>
              <strong>{theme.label}</strong>
              <small>{theme.hint}</small>
            </label>
          ))}
        </div>
      </fieldset>

      <label className={styles.switchRow} htmlFor="reduced-motion">
        <span>
          <strong>Reduce motion</strong>
          <small>The saved setting and your operating system are both respected.</small>
        </span>
        <input
          id="reduced-motion"
          type="checkbox"
          checked={preferences.reducedMotion}
          onChange={(event) => onChange({ reducedMotion: event.target.checked })}
        />
      </label>

      <CardActions
        online={online}
        saveState={saveState}
        message={message}
        saveLabel="Save appearance"
        onSave={onSave}
        onReviewLatest={onReviewLatest}
      />
    </section>
  );
}
