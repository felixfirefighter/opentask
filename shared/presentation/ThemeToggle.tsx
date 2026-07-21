"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { synchronizeThemeColor } from "@/shared/design/theme-color";

import { withThemeTransitionSuppressed } from "./theme-transition";

const darkThemeQuery = "(prefers-color-scheme: dark)";

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribeToTheme, readTheme, () => false);

  function toggleTheme() {
    const nextDark = !dark;
    const nextTheme = nextDark ? "dark" : "light";
    withThemeTransitionSuppressed(() => {
      document.documentElement.dataset.theme = nextTheme;
      document.documentElement.dataset.themePreference = nextTheme;
      synchronizeThemeColor(nextTheme);
    });
    try {
      localStorage.setItem("opentask-theme-preference", nextTheme);
    } catch {
      // The in-memory theme still works when browser storage is unavailable.
    }
    window.dispatchEvent(new Event("opentask-theme-change"));
  }

  return (
    <button
      type="button"
      className="icon-button"
      onClick={toggleTheme}
      aria-label={dark ? "Use light theme" : "Use dark theme"}
      title={dark ? "Use light theme" : "Use dark theme"}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function subscribeToTheme(onChange: () => void) {
  const colorScheme = window.matchMedia(darkThemeQuery);
  const synchronizeSystemTheme = (event: MediaQueryListEvent) => {
    const root = document.documentElement;
    if (root.dataset.themePreference !== "system") return;

    const nextTheme = event.matches ? "dark" : "light";
    if (root.dataset.theme === nextTheme) return;

    withThemeTransitionSuppressed(() => {
      root.dataset.theme = nextTheme;
      synchronizeThemeColor(nextTheme);
    });
    onChange();
  };

  window.addEventListener("opentask-theme-change", onChange);
  colorScheme.addEventListener("change", synchronizeSystemTheme);
  return () => {
    window.removeEventListener("opentask-theme-change", onChange);
    colorScheme.removeEventListener("change", synchronizeSystemTheme);
  };
}

function readTheme() {
  return document.documentElement.dataset.theme === "dark";
}
