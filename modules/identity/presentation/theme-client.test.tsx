import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { applyThemePreference, readThemePreview, ThemePreferenceSync } from "./theme-client";

afterEach(() => {
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themePreference;
  delete document.documentElement.dataset.reducedMotion;
  delete document.documentElement.dataset.themeTransition;
  vi.restoreAllMocks();
});

describe("theme-client", () => {
  it("applies and reads an explicit preview without persisting it", () => {
    const flush = vi.spyOn(document.documentElement, "getBoundingClientRect");
    expect(applyThemePreference("dark", true)).toEqual({
      theme: "dark",
      resolvedTheme: "dark",
      reducedMotion: true,
    });
    expect(readThemePreview()).toEqual({
      theme: "dark",
      resolvedTheme: "dark",
      reducedMotion: true,
    });
    expect(flush).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.themeTransition).toBeUndefined();
  });

  it("keeps a system preference synchronized with color-scheme changes", async () => {
    let dark = false;
    let notifyChange: (() => void) | undefined;
    const flush = vi.spyOn(document.documentElement, "getBoundingClientRect");
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query) =>
        ({
          matches: dark,
          media: query,
          onchange: null,
          addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
            notifyChange = () => {
              if (typeof listener === "function") listener(new Event("change"));
              else listener.handleEvent(new Event("change"));
            };
          },
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );

    render(<ThemePreferenceSync theme="system" reducedMotion={false} />);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
    expect(document.querySelector("script[data-theme-bootstrap]")).not.toBeInTheDocument();

    dark = true;
    act(() => notifyChange?.());

    expect(readThemePreview()).toEqual({
      theme: "system",
      resolvedTheme: "dark",
      reducedMotion: false,
    });
    expect(flush).toHaveBeenCalledTimes(2);
    expect(document.documentElement.dataset.themeTransition).toBeUndefined();
  });
});
