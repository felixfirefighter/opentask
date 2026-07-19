import { afterEach, describe, expect, it, vi } from "vitest";

import { withThemeTransitionSuppressed } from "./theme-transition";

afterEach(() => {
  delete document.documentElement.dataset.themeTransition;
  vi.restoreAllMocks();
});

describe("withThemeTransitionSuppressed", () => {
  it("applies the update and layout flush while the global suppression marker is present", () => {
    const root = document.documentElement;
    const flush = vi.spyOn(root, "getBoundingClientRect");

    const result = withThemeTransitionSuppressed(() => {
      expect(root.dataset.themeTransition).toBe("suppressed");
      root.dataset.theme = "dark";
      return "updated";
    });

    expect(result).toBe("updated");
    expect(flush).toHaveBeenCalledOnce();
    expect(root.dataset.themeTransition).toBeUndefined();
  });

  it("restores an existing marker even when the update throws", () => {
    const root = document.documentElement;
    root.dataset.themeTransition = "outer-update";

    expect(() =>
      withThemeTransitionSuppressed(() => {
        expect(root.dataset.themeTransition).toBe("suppressed");
        throw new Error("theme update failed");
      }),
    ).toThrow("theme update failed");

    expect(root.dataset.themeTransition).toBe("outer-update");
  });
});
