"use client";

import { useEffect } from "react";

import { synchronizeThemeColor } from "@/shared/design/theme-color";
import { withThemeTransitionSuppressed } from "@/shared/presentation";

import type { PreferenceDocument } from "../application/preferences-contract";

export type ThemePreference = PreferenceDocument["theme"];
export type ResolvedTheme = Exclude<ThemePreference, "system">;
export type ThemePreview = Readonly<{
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  reducedMotion: boolean;
}>;

const darkThemeQuery = "(prefers-color-scheme: dark)";

export function applyThemePreference(theme: ThemePreference, reducedMotion: boolean): ThemePreview | null {
  if (typeof document === "undefined") return null;

  const resolvedTheme = resolveTheme(theme);
  const root = document.documentElement;
  withThemeTransitionSuppressed(() => {
    root.dataset.theme = resolvedTheme;
    root.dataset.themePreference = theme;
    root.dataset.reducedMotion = String(reducedMotion);
    synchronizeThemeColor(resolvedTheme);
  });
  try {
    localStorage.setItem("opentask-theme-preference", theme);
  } catch {
    // Theme application remains functional when storage is unavailable.
  }

  return { theme, resolvedTheme, reducedMotion };
}

export function readThemePreview(): ThemePreview | null {
  if (typeof document === "undefined") return null;

  const { theme, themePreference, reducedMotion } = document.documentElement.dataset;
  const resolvedTheme: ResolvedTheme = theme === "dark" ? "dark" : "light";
  const preference = isThemePreference(themePreference) ? themePreference : resolvedTheme;

  return {
    theme: preference,
    resolvedTheme,
    reducedMotion: reducedMotion === "true",
  };
}

export function ThemePreferenceSync({
  theme,
  reducedMotion,
}: {
  theme: ThemePreference;
  reducedMotion: boolean;
}) {
  useEffect(() => {
    applyThemePreference(theme, reducedMotion);
    if (theme !== "system") return;

    const colorScheme = window.matchMedia(darkThemeQuery);
    const synchronizeSystemTheme = () => applyThemePreference(theme, reducedMotion);
    colorScheme.addEventListener("change", synchronizeSystemTheme);

    return () => colorScheme.removeEventListener("change", synchronizeSystemTheme);
  }, [reducedMotion, theme]);

  return null;
}

function resolveTheme(theme: ThemePreference): ResolvedTheme {
  if (theme !== "system") return theme;
  if (typeof window === "undefined") return "light";
  return window.matchMedia(darkThemeQuery).matches ? "dark" : "light";
}

function isThemePreference(value: string | undefined): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}
