import type { Clock } from "@/shared/time/clock";
import { describe, expect, it } from "vitest";

import { createQuickAddApplication } from "./quick-add-application";

const singaporeClock: Clock = { now: () => new Date("2026-07-19T01:00:00.000Z") };

describe("quick-add parsing", () => {
  it("preserves the exact source while exposing an editable timed suggestion", () => {
    const sourceText = "  Record demo tomorrow at 2pm  ";
    const result = createQuickAddApplication({ clock: singaporeClock }).parseQuickAdd({
      text: sourceText,
      timezone: "Asia/Singapore",
    });

    expect(result.sourceText).toBe(sourceText);
    expect(result.suggestions).toEqual([
      {
        recognizedText: "tomorrow at 2pm",
        startIndex: 14,
        endIndex: 29,
        schedule: {
          kind: "timed",
          startAt: "2026-07-20T06:00:00Z",
          endAt: "2026-07-20T06:00:00Z",
          timezone: "Asia/Singapore",
        },
        warnings: [],
      },
    ]);
    expect(result.sourceText.slice(14, 29)).toBe("tomorrow at 2pm");
  });

  it("turns a recognized date into an inclusive/exclusive all-day value without rewriting text", () => {
    const result = createQuickAddApplication({ clock: singaporeClock }).parseQuickAdd({
      text: "Prepare demo tomorrow",
      timezone: "Asia/Singapore",
    });
    expect(result).toMatchObject({
      sourceText: "Prepare demo tomorrow",
      suggestions: [
        {
          recognizedText: "tomorrow",
          schedule: { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-21" },
        },
      ],
    });
  });

  it("keeps unrelated text and returns no invented schedule", () => {
    expect(
      createQuickAddApplication({ clock: singaporeClock }).parseQuickAdd({
        text: "Prepare clean demo data",
        timezone: "Asia/Singapore",
      }),
    ).toEqual({ sourceText: "Prepare clean demo data", suggestions: [] });
  });

  it("surfaces deterministic DST gap and fold choices instead of hiding ambiguity", () => {
    const parser = createQuickAddApplication({
      clock: { now: () => new Date("2026-03-01T12:00:00.000Z") },
    });
    expect(
      parser.parseQuickAdd({
        text: "Call on March 8, 2026 at 2:30am",
        timezone: "America/New_York",
      }).suggestions[0],
    ).toMatchObject({
      schedule: { kind: "timed", startAt: "2026-03-08T07:30:00Z" },
      warnings: ["dst_gap_shifted_later"],
    });

    expect(
      parser.parseQuickAdd({
        text: "Call on November 1, 2026 at 1:30am",
        timezone: "America/New_York",
      }).suggestions[0],
    ).toMatchObject({
      schedule: { kind: "timed", startAt: "2026-11-01T05:30:00Z" },
      warnings: ["dst_fold_earlier_instance"],
    });
  });
});
