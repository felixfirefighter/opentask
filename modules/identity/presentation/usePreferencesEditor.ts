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

class DefinitePreferenceSaveError extends Error {}

const preferenceCardFields = {
  "date-time": ["timezone", "weekStart", "hourCycle"],
  appearance: ["theme", "reducedMotion"],
} as const satisfies Record<PreferenceCard, ReadonlyArray<keyof UserPreferencesPatch>>;

export function usePreferencesEditor(initialPreferences: UserPreferences) {
  const [saved, setSaved] = useState(initialPreferences);
  const [draft, setDraft] = useState(initialPreferences);
  const [states, setStates] = useState<Record<PreferenceCard, SaveState>>({
    "date-time": "idle",
    appearance: "idle",
  });
  const [messages, setMessages] = useState<Partial<Record<PreferenceCard, string>>>({});
  const savingCards = useRef(new Set<PreferenceCard>());
  const attemptedCardPatches = useRef<Partial<Record<PreferenceCard, UserPreferencesPatch>>>({});
  const savedRef = useRef(saved);
  const draftRef = useRef(draft);
  const online = useOnlineStatus();

  const updateDraft = useCallback((patch: UserPreferencesPatch) => {
    setDraft((current) => {
      const next = mergePreferenceDraft(current, patch);
      draftRef.current = next;
      return next;
    });
  }, []);

  const save = useCallback(
    async (card: PreferenceCard, patch: UserPreferencesPatch) => {
      if (!online || savingCards.current.has(card)) return;
      savingCards.current.add(card);
      attemptedCardPatches.current[card] = { ...patch };
      setStates((current) => ({ ...current, [card]: "saving" }));
      setMessages((current) => ({ ...current, [card]: "Saving…" }));

      try {
        const response = await fetch("/api/v1/preferences", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expectedVersion: savedRef.current.version, patch }),
        });
        if (response.status === 409) {
          const currentSaved = savedRef.current;
          if (card === "appearance") {
            applyThemePreference(currentSaved.theme, currentSaved.reducedMotion);
          }
          setStates((current) => ({ ...current, [card]: "conflict" }));
          setMessages((current) => ({
            ...current,
            [card]: "Settings changed elsewhere. Review the latest saved values.",
          }));
          return;
        }
        if (!response.ok) {
          if (response.status >= 400 && response.status < 500) {
            throw new DefinitePreferenceSaveError("Preference save failed");
          }
          throw new Error("Preference save outcome is unknown");
        }
        const next = userPreferencesSchema.parse(await response.json());
        delete attemptedCardPatches.current[card];
        savedRef.current = next;
        setSaved(next);
        setDraft((current) => {
          const merged = mergeSavedCard(current, next, card);
          draftRef.current = merged;
          return merged;
        });
        setStates((current) => ({ ...current, [card]: "saved" }));
        setMessages((current) => ({ ...current, [card]: "Saved" }));
        return next;
      } catch (caught) {
        if (caught instanceof DefinitePreferenceSaveError) {
          delete attemptedCardPatches.current[card];
          const currentSaved = savedRef.current;
          if (card === "appearance") {
            applyThemePreference(currentSaved.theme, currentSaved.reducedMotion);
          }
          setStates((current) => ({ ...current, [card]: "error" }));
          setMessages((current) => ({
            ...current,
            [card]: "These settings were not saved. Check your connection and try again.",
          }));
          return;
        }

        setStates((current) => ({ ...current, [card]: "conflict" }));
        setMessages((current) => ({
          ...current,
          [card]:
            "The save outcome could not be confirmed. Review the latest saved values before saving again.",
        }));
      } finally {
        savingCards.current.delete(card);
      }
    },
    [online],
  );

  const reviewLatest = useCallback(async (card: PreferenceCard) => {
    try {
      const response = await fetch("/api/v1/preferences", { cache: "no-store" });
      if (!response.ok) throw new Error("Latest preferences could not be loaded");
      const latest = userPreferencesSchema.parse(await response.json());
      const attemptedPatch = attemptedCardPatches.current[card];
      const attemptIsAuthoritative =
        attemptedPatch !== undefined && cardMatchesPatch(latest, card, attemptedPatch);
      const draftWithLatest = mergeLatestPreservingDraft(draftRef.current, savedRef.current, latest);
      const merged = attemptIsAuthoritative ? mergeSavedCard(draftWithLatest, latest, card) : draftWithLatest;
      delete attemptedCardPatches.current[card];
      savedRef.current = latest;
      draftRef.current = merged;
      setSaved(latest);
      setDraft(merged);
      setStates((current) => ({ ...current, [card]: attemptIsAuthoritative ? "saved" : "idle" }));
      setMessages((current) => ({
        ...current,
        [card]: attemptIsAuthoritative
          ? "Saved"
          : "Latest saved values loaded. Your edits are still here; save again when ready.",
      }));
      applyThemePreference(merged.theme, merged.reducedMotion);
      return latest;
    } catch {
      setMessages((current) => ({
        ...current,
        [card]: "The latest saved values could not be loaded. Your edits are still here; try again.",
      }));
      return undefined;
    }
  }, []);

  return { draft, messages, online, reviewLatest, save, saved, states, updateDraft };
}

function cardMatchesPatch(latest: UserPreferences, card: PreferenceCard, patch: UserPreferencesPatch) {
  const attemptedFields = preferenceCardFields[card].filter((field) => patch[field] !== undefined);
  return attemptedFields.length > 0 && attemptedFields.every((field) => latest[field] === patch[field]);
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

function mergeLatestPreservingDraft(
  draft: UserPreferences,
  previousSaved: UserPreferences,
  latest: UserPreferences,
): UserPreferences {
  return {
    ...latest,
    timezone: draft.timezone === previousSaved.timezone ? latest.timezone : draft.timezone,
    weekStart: draft.weekStart === previousSaved.weekStart ? latest.weekStart : draft.weekStart,
    hourCycle: draft.hourCycle === previousSaved.hourCycle ? latest.hourCycle : draft.hourCycle,
    theme: draft.theme === previousSaved.theme ? latest.theme : draft.theme,
    reducedMotion:
      draft.reducedMotion === previousSaved.reducedMotion ? latest.reducedMotion : draft.reducedMotion,
  };
}
