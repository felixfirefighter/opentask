import { describe, expect, it } from "vitest";

import { createNodeNotificationDigest } from "./node-notification-digest";

describe("node notification digest", () => {
  it("returns the raw and lowercase-hex SHA-256 forms", () => {
    const digest = createNodeNotificationDigest();
    expect(Buffer.from(digest.sha256Bytes("opaque endpoint")).toString("hex")).toBe(
      "3ce0e2fb845cd7224bbd8cc667168b60af8b545299094addf1fa979c9fb89149",
    );
    expect(digest.sha256Hex("opaque endpoint")).toBe(
      "3ce0e2fb845cd7224bbd8cc667168b60af8b545299094addf1fa979c9fb89149",
    );
  });
});
