import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { applyThemePreference, readThemePreview, ThemePreferenceSync } from "./theme-client";

afterEach(() => {
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themePreference;
  delete document.documentElement.dataset.reducedMotion;
  vi.restoreAllMocks();
});

describe("theme-client", () => {
  it("applies and reads an explicit preview without persisting it", () => {
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
  });

  it("keeps a system preference synchronized with color-scheme changes", async () => {
    let dark = false;
    let notifyChange: (() => void) | undefined;
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

    dark = true;
    act(() => notifyChange?.());

    expect(readThemePreview()).toEqual({
      theme: "system",
      resolvedTheme: "dark",
      reducedMotion: false,
    });
  });
});
