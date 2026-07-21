import { describe, expect, it } from "vitest";

import { createReminderDraft, parseReminderDraft, reminderSummary } from "./reminder-form-policy";

describe("task reminder form policy", () => {
  it("converts an absolute local value with the selected IANA timezone", () => {
    expect(
      parseReminderDraft(
        { kind: "absolute", absoluteLocal: "2099-07-21T09:30", offsetMinutes: "15", enabled: true },
        "Asia/Singapore",
      ),
    ).toMatchObject({
      valid: true,
      spec: { kind: "absolute", remindAt: "2099-07-21T01:30:00Z", offsetMinutes: null },
    });
  });

  it("rejects past, missing, daylight-saving-gap, and repeated absolute times", () => {
    expect(
      parseReminderDraft(
        { kind: "absolute", absoluteLocal: "2020-01-01T00:00", offsetMinutes: "15", enabled: true },
        "UTC",
      ),
    ).toEqual({ valid: false, message: "Choose a reminder time after the current time." });
    expect(
      parseReminderDraft({ kind: "absolute", absoluteLocal: "", offsetMinutes: "15", enabled: true }, "UTC"),
    ).toEqual({ valid: false, message: "Choose a valid local date and time." });
    expect(
      parseReminderDraft(
        { kind: "absolute", absoluteLocal: "2026-03-08T02:30", offsetMinutes: "15", enabled: true },
        "America/New_York",
      ),
    ).toEqual({ valid: false, message: "Choose a valid local date and time." });
    expect(
      parseReminderDraft(
        { kind: "absolute", absoluteLocal: "2026-11-01T01:30", offsetMinutes: "15", enabled: true },
        "America/New_York",
      ),
    ).toEqual({ valid: false, message: "Choose a valid local date and time." });
  });

  it.each(["-1", "10081", "1.5", "not-a-number"])("rejects an invalid relative offset of %s", (value) => {
    expect(
      parseReminderDraft(
        { kind: "relative_start", absoluteLocal: "", offsetMinutes: value, enabled: true },
        "UTC",
      ),
    ).toEqual({ valid: false, message: "Choose a whole-minute offset from 0 through 10,080." });
  });

  it("preserves reminder discriminants when creating drafts and summaries", () => {
    const reminder = {
      id: "5b56791d-5a76-4f71-9364-2e03d333da11",
      taskId: "d7286247-a36d-4907-b222-72a8e9878481",
      enabled: false,
      version: 3,
      spec: { kind: "relative_start", remindAt: null, offsetMinutes: 0 },
      createdAt: "2099-07-20T00:00:00Z",
      updatedAt: "2099-07-20T00:00:00Z",
    } as const;

    expect(createReminderDraft(reminder, "absolute", "UTC")).toMatchObject({
      kind: "relative_start",
      offsetMinutes: "0",
      enabled: false,
    });
    expect(reminderSummary(reminder, "UTC")).toBe("At the eligible start");
  });
});
