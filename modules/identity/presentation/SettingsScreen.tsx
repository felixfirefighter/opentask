"use client";

import { AppearancePreferencesCard } from "./AppearancePreferencesCard";
import { AppResetCard } from "./AppResetCard";
import { DateTimePreferencesCard } from "./DateTimePreferencesCard";
import { DataExportCard } from "./DataExportCard";
import { OpenAISettingsCard, type OpenAISettingsState } from "./OpenAISettingsCard";
import styles from "./SettingsScreen.module.css";
import { applyThemePreference } from "./theme-client";
import { mergePreferenceDraft, usePreferencesEditor } from "./usePreferencesEditor";
import type { UserPreferences, UserPreferencesPatch } from "../application/preferences-contract";

export function SettingsScreen({
  initialOpenAISettings = { configured: false, source: "none" },
  initialPreferences,
}: {
  initialPreferences: UserPreferences;
  initialOpenAISettings?: OpenAISettingsState;
}) {
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

      <OpenAISettingsCard initialSettings={initialOpenAISettings} online={editor.online} />
      <DataExportCard online={editor.online} />
      <AppResetCard />
    </div>
  );
}
