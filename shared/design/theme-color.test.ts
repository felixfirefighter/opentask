import { afterEach, describe, expect, it, vi } from "vitest";

import pwaMetadata from "./pwa-metadata.json";
import { createPublicThemeBootstrapScript, synchronizeThemeColor, themeColorFor } from "./theme-color";

afterEach(() => {
  document.head.querySelectorAll("[data-opentask-theme-color-test]").forEach((element) => element.remove());
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themePreference;
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("active browser theme color", () => {
  it("keeps every media-specific metadata element synchronized with the resolved theme", () => {
    const elements = installThemeColorFixtures();
    const darkElements = synchronizeThemeColor("dark");

    expect(darkElements).toEqual(elements);
    for (const element of elements) {
      expect(element).toHaveAttribute("name", "theme-color");
      expect(element).toHaveAttribute("content", pwaMetadata.darkThemeColor);
    }
    expect(themeColorFor("light")).toBe(pwaMetadata.lightThemeColor);

    expect(synchronizeThemeColor("light")).toEqual(elements);
    for (const element of elements) {
      expect(element).toHaveAttribute("content", pwaMetadata.lightThemeColor);
    }
  });

  it("emits a pre-hydration bootstrap for saved/system theme and matching browser chrome", () => {
    const source = createPublicThemeBootstrapScript();

    expect(source).toContain('localStorage.getItem("opentask-theme-preference")');
    expect(source).toContain('window.matchMedia("(prefers-color-scheme: dark)")');
    expect(source).toContain("r.dataset.themePreference=p");
    expect(source).toContain("r.dataset.theme=t");
    expect(source).toContain("querySelectorAll('meta[name=\"theme-color\"]')");
    expect(source).toContain(JSON.stringify(pwaMetadata.lightThemeColor));
    expect(source).toContain(JSON.stringify(pwaMetadata.darkThemeColor));
  });
});

function installThemeColorFixtures() {
  return ["light", "dark"].map((theme) => {
    const element = document.createElement("meta");
    element.name = "theme-color";
    element.media = `(prefers-color-scheme: ${theme})`;
    element.dataset.opentaskThemeColorTest = "";
    document.head.append(element);
    return element;
  });
}
