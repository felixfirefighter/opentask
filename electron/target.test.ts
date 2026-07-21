import { describe, expect, it } from "vitest";

import { getDesktopTarget, getExecutableSuffix } from "./target";

describe("desktop runtime targets", () => {
  it.each([
    ["win32", "x64", "windows-x64"],
    ["darwin", "x64", "macos-x64"],
    ["darwin", "arm64", "macos-arm64"],
  ] as const)("maps %s/%s to %s", (platform, architecture, target) => {
    expect(getDesktopTarget(platform, architecture)).toBe(target);
  });

  it("rejects unsupported Windows architectures", () => {
    expect(() => getDesktopTarget("win32", "arm64")).toThrow("supports x64 only");
  });

  it("rejects unsupported operating systems", () => {
    expect(() => getDesktopTarget("linux", "x64")).toThrow("Unsupported desktop target");
  });

  it("uses the platform executable suffix", () => {
    expect(getExecutableSuffix("win32")).toBe(".exe");
    expect(getExecutableSuffix("darwin")).toBe("");
  });
});
