import type { UserPreferences, UserPreferencesPatch } from "../application/preferences-contract";

import styles from "./SettingsScreen.module.css";
import type { SaveState } from "./usePreferencesEditor";

const weekDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const timeZones = ["UTC", ...Intl.supportedValuesOf("timeZone")];

export function DateTimePreferencesCard({
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
  const localTime = formatLocalTime(preferences.timezone, preferences.hourCycle);
  const fieldsDisabled = saveState === "saving";

  return (
    <section className={styles.card} aria-labelledby="date-time-title">
      <div className={styles.cardHeading}>
        <div>
          <p className="eyebrow">Preferences</p>
          <h2 id="date-time-title">Date and time</h2>
        </div>
        <span className={styles.previewTime}>{localTime}</span>
      </div>

      <div className={styles.fieldGrid}>
        <label className={styles.field} htmlFor="timezone">
          <span id="timezone-label">Timezone</span>
          <input
            id="timezone"
            list="opentask-timezones"
            value={preferences.timezone}
            disabled={fieldsDisabled}
            aria-labelledby="timezone-label"
            aria-describedby="timezone-help"
            onChange={(event) => onChange({ timezone: event.target.value })}
          />
          <datalist id="opentask-timezones">
            {timeZones.map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
          <small id="timezone-help">
            Today and Calendar use this local day. Saved instants are not rewritten.
          </small>
        </label>

        <label className={styles.field} htmlFor="week-start">
          <span>Week starts on</span>
          <select
            id="week-start"
            value={preferences.weekStart}
            disabled={fieldsDisabled}
            onChange={(event) =>
              onChange({ weekStart: Number(event.target.value) as UserPreferences["weekStart"] })
            }
          >
            {weekDays.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </select>
        </label>

        <fieldset className={styles.fieldset} disabled={fieldsDisabled}>
          <legend>Time display</legend>
          <label>
            <input
              type="radio"
              name="hour-cycle"
              value="h12"
              checked={preferences.hourCycle === "h12"}
              onChange={() => onChange({ hourCycle: "h12" })}
            />
            1:30 PM
          </label>
          <label>
            <input
              type="radio"
              name="hour-cycle"
              value="h23"
              checked={preferences.hourCycle === "h23"}
              onChange={() => onChange({ hourCycle: "h23" })}
            />
            13:30
          </label>
        </fieldset>
      </div>

      <CardActions
        online={online}
        saveState={saveState}
        message={message}
        saveLabel="Save date and time"
        onSave={onSave}
        onReviewLatest={onReviewLatest}
      />
    </section>
  );
}

export function CardActions({
  online,
  saveState,
  message,
  saveLabel,
  onSave,
  onReviewLatest,
}: {
  online: boolean;
  saveState: SaveState;
  message: string | undefined;
  saveLabel: string;
  onSave(): void;
  onReviewLatest(): void;
}) {
  return (
    <div className={styles.cardActions}>
      <p className={styles.saveStatus} aria-live="polite">
        {message ?? (!online ? "Offline · saved values are shown, but changes cannot be saved." : undefined)}
      </p>
      {saveState === "conflict" && (
        <button type="button" className="secondary-button" onClick={onReviewLatest}>
          Review latest
        </button>
      )}
      <button
        type="button"
        className="primary-button"
        disabled={!online || saveState === "saving"}
        onClick={onSave}
      >
        {saveState === "saving" ? "Saving…" : saveLabel}
      </button>
    </div>
  );
}

function formatLocalTime(timeZone: string, hourCycle: UserPreferences["hourCycle"]) {
  try {
    return new Intl.DateTimeFormat("en", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      hourCycle,
      timeZoneName: "short",
    }).format(new Date());
  } catch {
    return "Invalid timezone";
  }
}
