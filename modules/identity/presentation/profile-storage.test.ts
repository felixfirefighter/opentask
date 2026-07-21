import { beforeEach, describe, expect, it } from "vitest";

import { readProfileUsername, saveProfileUsername, validateProfileUsername } from "./profile-storage";

describe("profile username storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("trims and caches a username locally", () => {
    expect(saveProfileUsername("  Ekko  ")).toBe("Ekko");
    expect(readProfileUsername()).toBe("Ekko");
  });

  it("rejects empty, oversized, and control-character usernames", () => {
    expect(validateProfileUsername("   ")).toBe("Enter a username to open your workspace.");
    expect(validateProfileUsername("x".repeat(65))).toContain("64 characters");
    expect(validateProfileUsername("Ekko\nTest")).toBe("Use visible characters only.");
  });
});
