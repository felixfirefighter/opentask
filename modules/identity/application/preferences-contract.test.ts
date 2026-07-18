import { describe, expect, it } from "vitest";

import {
  defaultPreferenceDocument,
  preferenceDocumentSchema,
  updateUserPreferencesRequestSchema,
} from "./preferences-contract";

describe("user preference contract", () => {
  it("accepts every closed preference choice and a canonical IANA timezone", () => {
    for (const weekStart of [0, 1, 2, 3, 4, 5, 6] as const) {
      expect(preferenceDocumentSchema.parse({ ...defaultPreferenceDocument, weekStart })).toMatchObject({
        weekStart,
      });
    }
    for (const hourCycle of ["h12", "h23"] as const) {
      expect(preferenceDocumentSchema.parse({ ...defaultPreferenceDocument, hourCycle })).toMatchObject({
        hourCycle,
      });
    }
    for (const theme of ["light", "dark", "system"] as const) {
      expect(preferenceDocumentSchema.parse({ ...defaultPreferenceDocument, theme })).toMatchObject({
        theme,
      });
    }

    expect(
      preferenceDocumentSchema.parse({
        ...defaultPreferenceDocument,
        timezone: "Asia/Singapore",
      }),
    ).toMatchObject({ timezone: "Asia/Singapore" });
  });

  it("rejects invalid zones, choices, empty patches, and unknown keys", () => {
    expect(() =>
      preferenceDocumentSchema.parse({ ...defaultPreferenceDocument, timezone: "Mars/Olympus" }),
    ).toThrow();
    expect(() => preferenceDocumentSchema.parse({ ...defaultPreferenceDocument, weekStart: 7 })).toThrow();
    expect(() => updateUserPreferencesRequestSchema.parse({ expectedVersion: 1, patch: {} })).toThrow();
    expect(() =>
      updateUserPreferencesRequestSchema.parse({
        expectedVersion: 1,
        patch: { theme: "dark", userId: "not-allowed" },
      }),
    ).toThrow();
  });
});
