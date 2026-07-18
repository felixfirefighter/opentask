"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribeToTheme, readTheme, () => false);

  function toggleTheme() {
    const nextDark = !dark;
    document.documentElement.dataset.theme = nextDark ? "dark" : "light";
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
  window.addEventListener("opentask-theme-change", onChange);
  return () => window.removeEventListener("opentask-theme-change", onChange);
}

function readTheme() {
  return document.documentElement.dataset.theme === "dark";
}
