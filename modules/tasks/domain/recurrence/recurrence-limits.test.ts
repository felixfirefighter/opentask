import { describe, expect, it } from "vitest";

import {
  assertRecurrenceExpansionBudget,
  assertRecurrenceRangeBounds,
  assertRecurrenceSeriesCandidateLimit,
  MAX_RECURRENCE_CANDIDATES_PER_REQUEST,
  MAX_RECURRENCE_CANDIDATES_PER_SERIES,
  MAX_RECURRENCE_ROWS_PER_REQUEST,
  MAX_SCHEDULE_AND_OCCURRENCE_ROWS,
} from "./recurrence-limits";

describe("recurrence request limits", () => {
  it("accepts the 62-local-day and 63-elapsed-day query boundaries", () => {
    expect(() =>
      assertRecurrenceRangeBounds("2026-01-01", "2026-03-04", "2026-01-01T00:00:00Z", "2026-03-05T00:00:00Z"),
    ).not.toThrow();
  });

  it("rejects a range beyond either frozen boundary", () => {
    expect(() =>
      assertRecurrenceRangeBounds("2026-01-01", "2026-03-05", "2026-01-01T00:00:00Z", "2026-03-05T00:00:00Z"),
    ).toThrow(RangeError);
    expect(() =>
      assertRecurrenceRangeBounds(
        "2026-01-01",
        "2026-03-04",
        "2026-01-01T00:00:00Z",
        "2026-03-05T00:00:00.001Z",
      ),
    ).toThrow(RangeError);
  });

  it("accepts exact source, computation, and output caps", () => {
    expect(() => assertRecurrenceSeriesCandidateLimit(MAX_RECURRENCE_CANDIDATES_PER_SERIES)).not.toThrow();
    expect(() =>
      assertRecurrenceExpansionBudget({
        recurrenceRows: MAX_RECURRENCE_ROWS_PER_REQUEST,
        candidateCount: MAX_RECURRENCE_CANDIDATES_PER_REQUEST,
        outputRows: MAX_SCHEDULE_AND_OCCURRENCE_ROWS,
      }),
    ).not.toThrow();
  });

  it("rejects any cap overrun", () => {
    expect(() => assertRecurrenceSeriesCandidateLimit(1_001)).toThrow(RangeError);
    expect(() =>
      assertRecurrenceExpansionBudget({ recurrenceRows: 501, candidateCount: 0, outputRows: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      assertRecurrenceExpansionBudget({ recurrenceRows: 0, candidateCount: 50_001, outputRows: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      assertRecurrenceExpansionBudget({ recurrenceRows: 0, candidateCount: 0, outputRows: 501 }),
    ).toThrow(RangeError);
  });
});
