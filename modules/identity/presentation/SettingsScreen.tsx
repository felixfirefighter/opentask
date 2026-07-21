"use client";

import { markWorkspaceRoutesStale, useUnsavedNavigationGuard } from "@/shared/presentation";
import type { ReactNode } from "react";

import { AppearancePreferencesCard } from "./AppearancePreferencesCard";
import { DateTimePreferencesCard } from "./DateTimePreferencesCard";
import { DataExportCard } from "./DataExportCard";
import { OptionalAiSettingsCard, type OptionalAiCapability } from "./OptionalAiSettingsCard";
import { PwaSettingsCard } from "./PwaSettingsCard";
import styles from "./SettingsScreen.module.css";
import { applyThemePreference } from "./theme-client";
import { mergePreferenceDraft, usePreferencesEditor } from "./usePreferencesEditor";
import type { UserPreferences, UserPreferencesPatch } from "../application/preferences-contract";

export function SettingsScreen({
  aiCapability,
  initialPreferences,
  reminderControls,
}: {
  aiCapability: OptionalAiCapability;
  initialPreferences: UserPreferences;
  reminderControls?: ReactNode;
}) {
  const editor = usePreferencesEditor(initialPreferences);
  useUnsavedNavigationGuard(
    editor.dirty,
    "Discard unsaved Settings changes before leaving or updating OpenTask?",
    editor.discardDraft,
  );

  function updateAppearance(patch: UserPreferencesPatch) {
    const next = mergePreferenceDraft(editor.draft, patch);
    editor.updateDraft(patch);
    applyThemePreference(next.theme, next.reducedMotion);
  }

  async function saveDateAndTime() {
    const next = await editor.save("date-time", {
      timezone: editor.draft.timezone,
      weekStart: editor.draft.weekStart,
      hourCycle: editor.draft.hourCycle,
    });
    if (next) markWorkspaceRoutesStale();
  }

  async function reviewLatestDateAndTime() {
    const latest = await editor.reviewLatest("date-time");
    if (latest) markWorkspaceRoutesStale();
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <p className="eyebrow">Account</p>
        <h1 id="page-heading" tabIndex={-1} data-route-focus>
          Settings
        </h1>
        <p>Choose how dates, time, appearance, and this browser’s app shell work.</p>
      </header>

      <DateTimePreferencesCard
        preferences={editor.draft}
        online={editor.online}
        saveState={editor.states["date-time"]}
        message={editor.messages["date-time"]}
        onChange={editor.updateDraft}
        onSave={saveDateAndTime}
        onReviewLatest={reviewLatestDateAndTime}
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
        onReviewLatest={() => editor.reviewLatest("appearance")}
      />

      <OptionalAiSettingsCard capability={aiCapability} />

      <PwaSettingsCard reminderControls={reminderControls} />

      <DataExportCard online={editor.online} />
    </div>
  );
}
