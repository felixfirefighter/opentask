import { describe, expect, it } from "vitest";

import { findClientAddress } from "./authentication-gateway";

describe("authentication client-address policy", () => {
  it("ignores x-forwarded-for and returns null without x-real-ip", () => {
    expect(findClientAddress(new Headers())).toBeNull();
    expect(findClientAddress(new Headers({ "x-forwarded-for": "198.51.100.8" }))).toBeNull();
  });

  it("uses only a valid single x-real-ip value", () => {
    expect(
      findClientAddress(
        new Headers({
          "x-real-ip": "198.51.100.7",
          "x-forwarded-for": "203.0.113.9",
        }),
      ),
    ).toBe("198.51.100.7");
    expect(findClientAddress(new Headers({ "x-real-ip": "198.51.100.7, 203.0.113.9" }))).toBeNull();
    expect(findClientAddress(new Headers({ "x-real-ip": "not-an-address" }))).toBeNull();
  });

  it("normalizes IPv6 addresses to the configured /64 subnet", () => {
    expect(findClientAddress(new Headers({ "x-real-ip": "2001:db8:abcd:12:3456:789a:bcde:f012" }))).toBe(
      "2001:0db8:abcd:0012:0000:0000:0000:0000",
    );
  });
});
