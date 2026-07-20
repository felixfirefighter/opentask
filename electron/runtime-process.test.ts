import { describe, expect, it } from "vitest";

import { getNodeExecutable } from "./runtime-process";

describe("desktop runtime process helpers", () => {
  it("builds a target-specific bundled Node path", () => {
    expect(getNodeExecutable("/resources", "macos-arm64", "")).toBe(
      "/resources/runtime/node/macos-arm64/node",
    );
    expect(getNodeExecutable("C:\\resources", "windows-x64", ".exe")).toBe(
      "C:\\resources/runtime/node/windows-x64/node.exe",
    );
  });
});
