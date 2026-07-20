"use client";

import { AppearancePreferencesCard } from "./AppearancePreferencesCard";
import { DateTimePreferencesCard } from "./DateTimePreferencesCard";
import { DataExportCard } from "./DataExportCard";
import styles from "./SettingsScreen.module.css";
import { applyThemePreference } from "./theme-client";
import { mergePreferenceDraft, usePreferencesEditor } from "./usePreferencesEditor";
import type { UserPreferences, UserPreferencesPatch } from "../application/preferences-contract";

export function SettingsScreen({ initialPreferences }: { initialPreferences: UserPreferences }) {
  const editor = usePreferencesEditor(initialPreferences);

  function updateAppearance(patch: UserPreferencesPatch) {
    const next = mergePreferenceDraft(editor.draft, patch);
    editor.updateDraft(patch);
    applyThemePreference(next.theme, next.reducedMotion);
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <p className="eyebrow">Account</p>
        <h1 id="page-heading" tabIndex={-1} data-route-focus>
          Settings
        </h1>
        <p>Choose how dates, time, color, and motion appear in your workspace.</p>
      </header>

      <DateTimePreferencesCard
        preferences={editor.draft}
        online={editor.online}
        saveState={editor.states["date-time"]}
        message={editor.messages["date-time"]}
        onChange={editor.updateDraft}
        onSave={() =>
          editor.save("date-time", {
            weekStart: editor.draft.weekStart,
            hourCycle: editor.draft.hourCycle,
          })
        }
        onReviewLatest={editor.reviewLatest}
      />

      <AppearancePreferencesCard
        preferences={editor.draft}
        online={editor.online}
        saveState={editor.states.appearance}
        message={editor.messages.appearance}
        onChange={updateAppearance}
        onSave={() =>
          editor.save("appearance", {
            theme: editor.draft.theme,
            reducedMotion: editor.draft.reducedMotion,
          })
        }
        onReviewLatest={editor.reviewLatest}
      />

      <DataExportCard online={editor.online} />
    </div>
  );
}
