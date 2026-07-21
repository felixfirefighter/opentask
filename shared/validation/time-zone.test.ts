import { describe, expect, it } from "vitest";

import { generatedTimeZones } from "./canonical-time-zones.generated";
import { CANONICAL_IANA_TIME_ZONES, isCanonicalIanaTimeZone } from "./canonical-time-zones";
import { ianaTimeZoneSchema } from "./time-zone";

describe("canonical timezone validation", () => {
  it("matches the allowlist generated from the pinned Node runtime exactly", () => {
    expect(CANONICAL_IANA_TIME_ZONES).toEqual(["UTC", ...Intl.supportedValuesOf("timeZone")]);
    expect(generatedTimeZones.generatedFrom.nodeMajor).toBe(24);
  });

  it("accepts canonical spellings and rejects aliases or invented zones", () => {
    for (const value of ["UTC", "Asia/Singapore", "America/New_York"]) {
      expect(isCanonicalIanaTimeZone(value)).toBe(true);
      expect(ianaTimeZoneSchema.parse(value)).toBe(value);
    }
    for (const value of ["US/Eastern", "Etc/UTC", "+08:00", "Mars/Olympus", ""]) {
      expect(isCanonicalIanaTimeZone(value)).toBe(false);
      expect(ianaTimeZoneSchema.safeParse(value).success).toBe(false);
    }
  });
});
