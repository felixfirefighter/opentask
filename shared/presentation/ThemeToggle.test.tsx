import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeToggle } from "./ThemeToggle";

afterEach(() => {
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themePreference;
  delete document.documentElement.dataset.themeTransition;
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("ThemeToggle", () => {
  it("tracks OS color-scheme changes while the saved preference is system", () => {
    const colorScheme = mockColorScheme(false);
    const root = document.documentElement;
    root.dataset.theme = "light";
    root.dataset.themePreference = "system";
    localStorage.setItem("opentask-theme-preference", "system");
    const flush = vi.spyOn(root, "getBoundingClientRect");

    const { unmount } = render(<ThemeToggle />);
    expect(screen.getByRole("button", { name: "Use dark theme" })).toBeVisible();

    act(() => colorScheme.setDark(true));

    expect(root.dataset.theme).toBe("dark");
    expect(root.dataset.themePreference).toBe("system");
    expect(root.dataset.themeTransition).toBeUndefined();
    expect(flush).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Use light theme" })).toBeVisible();

    unmount();
    expect(colorScheme.listenerCount()).toBe(0);
  });

  it("does not replace an explicit preference when the OS color scheme changes", () => {
    const colorScheme = mockColorScheme(false);
    const root = document.documentElement;
    root.dataset.theme = "light";
    root.dataset.themePreference = "light";
    localStorage.setItem("opentask-theme-preference", "light");
    const flush = vi.spyOn(root, "getBoundingClientRect");

    render(<ThemeToggle />);
    act(() => colorScheme.setDark(true));

    expect(root.dataset.theme).toBe("light");
    expect(root.dataset.themePreference).toBe("light");
    expect(flush).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Use dark theme" })).toBeVisible();
  });
});

function mockColorScheme(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const media = "(prefers-color-scheme: dark)";
  const mediaQuery = {
    get matches() {
      return dark;
    },
    media,
    onchange: null,
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.delete(listener);
    },
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  } as MediaQueryList;
  vi.spyOn(window, "matchMedia").mockReturnValue(mediaQuery);

  return {
    listenerCount: () => listeners.size,
    setDark(nextDark: boolean) {
      dark = nextDark;
      const event = { matches: dark, media } as MediaQueryListEvent;
      for (const listener of listeners) {
        if (typeof listener === "function") listener(event);
        else listener.handleEvent(event);
      }
    },
  };
}
