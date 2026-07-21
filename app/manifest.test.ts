import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import pwaMetadata from "@/shared/design/pwa-metadata.json";

import manifest from "./manifest";

const expectedIcons = [
  { src: "/icons/opentask-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/opentask-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  {
    src: "/icons/opentask-maskable-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable",
  },
] as const;

const fallbackTokenNames = {
  light: {
    action: "--action",
    border: "--border",
    borderStrong: "--border-strong",
    brand: "--brand",
    canvas: "--canvas",
    focusRing: "--focus-ring",
    surface: "--surface",
    text: "--text",
    textMuted: "--text-muted",
    textOnStrong: "--text-on-strong",
  },
  dark: {
    action: "--action",
    border: "--border",
    canvas: "--canvas",
    focusRing: "--focus-ring",
    surface: "--surface",
    text: "--text",
    textMuted: "--text-muted",
    textOnStrong: "--text-on-strong",
  },
} as const;

describe("OpenTask web app manifest", () => {
  it("declares one honest root-scoped standalone application with original local icons", async () => {
    const document = manifest();

    expect(Object.keys(document).sort()).toEqual(
      [
        "background_color",
        "categories",
        "description",
        "dir",
        "display",
        "icons",
        "id",
        "lang",
        "name",
        "orientation",
        "prefer_related_applications",
        "scope",
        "short_name",
        "start_url",
        "theme_color",
      ].sort(),
    );
    expect(document).toMatchObject({
      id: "/",
      name: "OpenTask",
      short_name: "OpenTask",
      description:
        "Open-source personal planning for tasks, time, habits, Focus, and reviewable AI proposals.",
      lang: "en",
      dir: "ltr",
      start_url: "/today",
      scope: "/",
      display: "standalone",
      orientation: "any",
      background_color: pwaMetadata.backgroundColor,
      theme_color: pwaMetadata.lightThemeColor,
      categories: ["productivity"],
      prefer_related_applications: false,
      icons: expectedIcons,
    });

    const manifestRecord = document as Record<string, unknown>;
    for (const excludedClaim of [
      "file_handlers",
      "launch_handler",
      "protocol_handlers",
      "related_applications",
      "share_target",
    ]) {
      expect(manifestRecord).not.toHaveProperty(excludedClaim);
    }

    for (const icon of expectedIcons) {
      expect(new URL(icon.src, "https://opentask.example").origin).toBe("https://opentask.example");
      const bytes = await readFile(path.join(process.cwd(), "public", icon.src));
      expect(readPngDimensions(bytes)).toEqual(parseDeclaredSize(icon.sizes));
    }
  });

  it("keeps manifest and static fallback colors aligned with canonical semantic tokens", async () => {
    const tokenSource = await readFile(path.join(process.cwd(), "shared/design/tokens.css"), "utf8");
    const tokenBlocks = {
      light: readCssBlock(tokenSource, /:root\s*{/),
      dark: readCssBlock(tokenSource, /:root\[data-theme="dark"\]\s*{/),
    };

    for (const theme of ["light", "dark"] as const) {
      for (const [metadataName, tokenName] of Object.entries(fallbackTokenNames[theme])) {
        const metadataValue =
          pwaMetadata.staticFallbackColors[theme][
            metadataName as keyof (typeof pwaMetadata.staticFallbackColors)[typeof theme]
          ];
        expect(metadataValue.toLowerCase(), `${theme}.${metadataName}`).toBe(
          readCssColor(tokenBlocks[theme], tokenName).toLowerCase(),
        );
      }
    }

    expect(pwaMetadata.backgroundColor).toBe(pwaMetadata.staticFallbackColors.light.canvas);
    expect(pwaMetadata.lightThemeColor).toBe(pwaMetadata.staticFallbackColors.light.canvas);
    expect(pwaMetadata.darkThemeColor).toBe(pwaMetadata.staticFallbackColors.dark.canvas);

    const declaredStaticColors = new Set(
      [
        ...Object.values(pwaMetadata.staticFallbackColors.light),
        ...Object.values(pwaMetadata.staticFallbackColors.dark),
      ].map((color) => color.toLowerCase()),
    );
    for (const relativePath of [
      "public/offline.html",
      "public/sw.js",
      "public/icons/opentask-source.svg",
      "public/icons/opentask-maskable-source.svg",
    ]) {
      const staticSource = await readFile(path.join(process.cwd(), relativePath), "utf8");
      const colors = [...staticSource.matchAll(/#[\da-f]{6}\b/gi)].map(([color]) => color.toLowerCase());
      expect(colors.length, `${relativePath} must declare a tested static color`).toBeGreaterThan(0);
      expect(
        [...new Set(colors.filter((color) => !declaredStaticColors.has(color)))],
        `${relativePath} contains a color outside the static metadata mirror`,
      ).toEqual([]);
    }
  });
});

function readCssBlock(source: string, selector: RegExp) {
  const selectorMatch = selector.exec(source);
  expect(selectorMatch, `Missing CSS block matching ${selector}`).not.toBeNull();
  const start = (selectorMatch?.index ?? 0) + (selectorMatch?.[0].length ?? 0);
  const end = source.indexOf("}", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function readCssColor(block: string, tokenName: string) {
  const match = new RegExp(`${escapeRegExp(tokenName)}:\\s*(#[\\da-f]{6})`, "i").exec(block);
  expect(match, `Missing canonical token ${tokenName}`).not.toBeNull();
  return match?.[1] ?? "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDeclaredSize(size: string) {
  const [width, height] = size.split("x").map(Number);
  return { width, height };
}

function readPngDimensions(bytes: Buffer) {
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
