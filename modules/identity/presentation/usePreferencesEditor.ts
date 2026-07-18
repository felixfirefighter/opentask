"use client";

import { useCallback, useRef, useState } from "react";

import { useOnlineStatus } from "@/shared/presentation";

import {
  userPreferencesSchema,
  type UserPreferences,
  type UserPreferencesPatch,
} from "../application/preferences-contract";
import { applyThemePreference } from "./theme-client";

export type PreferenceCard = "date-time" | "appearance";
export type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";

export function usePreferencesEditor(initialPreferences: UserPreferences) {
  const [saved, setSaved] = useState(initialPreferences);
  const [draft, setDraft] = useState(initialPreferences);
  const [states, setStates] = useState<Record<PreferenceCard, SaveState>>({
    "date-time": "idle",
    appearance: "idle",
  });
  const [messages, setMessages] = useState<Partial<Record<PreferenceCard, string>>>({});
  const savingCards = useRef(new Set<PreferenceCard>());
  const online = useOnlineStatus();

  const updateDraft = useCallback((patch: UserPreferencesPatch) => {
    setDraft((current) => mergePreferenceDraft(current, patch));
  }, []);

  const save = useCallback(
    async (card: PreferenceCard, patch: UserPreferencesPatch) => {
      if (!online || savingCards.current.has(card)) return;
      savingCards.current.add(card);
      setStates((current) => ({ ...current, [card]: "saving" }));
      setMessages((current) => ({ ...current, [card]: "Saving…" }));

      try {
        const response = await fetch("/api/v1/preferences", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expectedVersion: saved.version, patch }),
        });
        if (response.status === 409) {
          if (card === "appearance") applyThemePreference(saved.theme, saved.reducedMotion);
          setStates((current) => ({ ...current, [card]: "conflict" }));
          setMessages((current) => ({
            ...current,
            [card]: "Settings changed elsewhere. Review the latest saved values.",
          }));
          return;
        }
        if (!response.ok) throw new Error("Preference save failed");
        const next = userPreferencesSchema.parse(await response.json());
        setSaved(next);
        setDraft((current) => mergeSavedCard(current, next, card));
        setStates((current) => ({ ...current, [card]: "saved" }));
        setMessages((current) => ({ ...current, [card]: "Saved" }));
      } catch {
        if (card === "appearance") applyThemePreference(saved.theme, saved.reducedMotion);
        setStates((current) => ({ ...current, [card]: "error" }));
        setMessages((current) => ({
          ...current,
          [card]: "These settings were not saved. Check your connection and try again.",
        }));
      } finally {
        savingCards.current.delete(card);
      }
    },
    [online, saved],
  );

  const reviewLatest = useCallback(async () => {
    const response = await fetch("/api/v1/preferences", { cache: "no-store" });
    if (!response.ok) return;
    const latest = userPreferencesSchema.parse(await response.json());
    setSaved(latest);
    setDraft(latest);
    setStates({ "date-time": "idle", appearance: "idle" });
    setMessages({});
    applyThemePreference(latest.theme, latest.reducedMotion);
  }, []);

  return { draft, messages, online, reviewLatest, save, saved, states, updateDraft };
}

export function mergePreferenceDraft(current: UserPreferences, patch: UserPreferencesPatch): UserPreferences {
  return {
    ...current,
    timezone: patch.timezone ?? current.timezone,
    weekStart: patch.weekStart ?? current.weekStart,
    hourCycle: patch.hourCycle ?? current.hourCycle,
    theme: patch.theme ?? current.theme,
    reducedMotion: patch.reducedMotion ?? current.reducedMotion,
  };
}

function mergeSavedCard(
  current: UserPreferences,
  saved: UserPreferences,
  card: PreferenceCard,
): UserPreferences {
  if (card === "date-time") {
    return {
      ...saved,
      theme: current.theme,
      reducedMotion: current.reducedMotion,
    };
  }

  return {
    ...saved,
    timezone: current.timezone,
    weekStart: current.weekStart,
    hourCycle: current.hourCycle,
  };
}
