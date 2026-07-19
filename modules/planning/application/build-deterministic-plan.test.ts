import { describe, expect, it } from "vitest";

import { buildDeterministicPlan } from "@/modules/planning";

import { schedulerGoldenFixtures } from "./scheduler-golden-fixtures";
import type { SchedulingInput } from "./scheduling-contract";

const singaporeWindow = {
  localDate: "2026-07-20",
  startTime: "09:00",
  endTime: "17:00",
} as const;

function input(overrides: Partial<SchedulingInput> = {}): SchedulingInput {
  return {
    timeZone: "Asia/Singapore",
    workWindows: [singaporeWindow],
    busyIntervals: [],
    bufferMinutes: 10,
    candidates: [],
    ...overrides,
  };
}

describe("buildDeterministicPlan golden fixtures", () => {
  for (const [name, fixture] of Object.entries(schedulerGoldenFixtures)) {
    it(`matches the ${name} fixture`, () => {
      expect(buildDeterministicPlan(fixture.input)).toEqual(fixture.expected);
    });
  }

  it("returns byte-for-byte equivalent output for repeated normalized input", () => {
    const fixture = schedulerGoldenFixtures.multiple.input;
    const first = buildDeterministicPlan(fixture);
    const second = buildDeterministicPlan(fixture);

    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe("buildDeterministicPlan temporal boundaries", () => {
  it("rejects canonical-looking but unsupported timezone identifiers", () => {
    expect(buildDeterministicPlan(input({ timeZone: "Mars/Olympus" }))).toEqual({
      placed: [],
      overflow: [],
      conflicts: [{ semanticRef: null, code: "INVALID_TIME_ZONE" }],
    });
  });

  it("rejects a spring-forward local time that does not exist", () => {
    const result = buildDeterministicPlan(
      input({
        timeZone: "America/New_York",
        workWindows: [{ localDate: "2026-03-08", startTime: "02:30", endTime: "04:00" }],
      }),
    );

    expect(result.conflicts).toEqual([{ semanticRef: null, code: "INVALID_WORK_WINDOW" }]);
    expect(result.placed).toEqual([]);
  });

  it("rejects a fall-back local time whose offset is ambiguous", () => {
    const result = buildDeterministicPlan(
      input({
        timeZone: "America/New_York",
        workWindows: [{ localDate: "2026-11-01", startTime: "01:30", endTime: "03:00" }],
      }),
    );

    expect(result.conflicts).toEqual([{ semanticRef: null, code: "INVALID_WORK_WINDOW" }]);
  });

  it("uses elapsed time across a DST gap instead of wall-clock subtraction", () => {
    const result = buildDeterministicPlan(
      input({
        timeZone: "America/New_York",
        workWindows: [{ localDate: "2026-03-08", startTime: "01:30", endTime: "03:30" }],
        bufferMinutes: 0,
        candidates: [{ kind: "flexible", semanticRef: "dst-task", durationMinutes: 60 }],
      }),
    );

    expect(result).toEqual({
      placed: [
        {
          semanticRef: "dst-task",
          startAt: "2026-03-08T06:30:00Z",
          endAt: "2026-03-08T07:30:00Z",
        },
      ],
      overflow: [],
      conflicts: [],
    });
  });
});

describe("buildDeterministicPlan interval policy", () => {
  it("keeps the configured buffer between sequential placed blocks", () => {
    const result = buildDeterministicPlan(
      input({
        bufferMinutes: 20,
        candidates: [
          { kind: "flexible", semanticRef: "first", durationMinutes: 30 },
          { kind: "flexible", semanticRef: "second", durationMinutes: 30 },
        ],
      }),
    );

    expect(result.placed).toEqual([
      {
        semanticRef: "first",
        startAt: "2026-07-20T01:00:00Z",
        endAt: "2026-07-20T01:30:00Z",
      },
      {
        semanticRef: "second",
        startAt: "2026-07-20T01:50:00Z",
        endAt: "2026-07-20T02:20:00Z",
      },
    ]);
  });

  it("accepts a flexible block that exactly fits the work window", () => {
    const result = buildDeterministicPlan(
      input({
        workWindows: [{ localDate: "2026-07-20", startTime: "09:00", endTime: "10:00" }],
        bufferMinutes: 30,
        candidates: [{ kind: "flexible", semanticRef: "exact", durationMinutes: 60 }],
      }),
    );

    expect(result.placed).toHaveLength(1);
    expect(result.conflicts).toEqual([]);
    expect(result.overflow).toEqual([]);
  });

  it("clips a busy interval to the window while preserving its buffer", () => {
    const result = buildDeterministicPlan(
      input({
        busyIntervals: [
          {
            semanticRef: "before-window",
            startAt: "2026-07-20T00:50:00Z",
            endAt: "2026-07-20T01:10:00Z",
          },
        ],
        candidates: [{ kind: "flexible", semanticRef: "after-busy", durationMinutes: 30 }],
      }),
    );

    expect(result.placed[0]?.startAt).toBe("2026-07-20T01:20:00Z");
  });

  it("rejects fixed candidates that cross either work-window boundary", () => {
    const result = buildDeterministicPlan(
      input({
        candidates: [
          {
            kind: "fixed",
            semanticRef: "starts-before",
            startAt: "2026-07-20T00:59:00Z",
            endAt: "2026-07-20T01:30:00Z",
          },
          {
            kind: "fixed",
            semanticRef: "ends-after",
            startAt: "2026-07-20T08:30:00Z",
            endAt: "2026-07-20T09:01:00Z",
          },
        ],
      }),
    );

    expect(result.placed).toEqual([]);
    expect(result.conflicts).toEqual([
      { semanticRef: "starts-before", code: "FIXED_OUTSIDE_WORK_WINDOW" },
      { semanticRef: "ends-after", code: "FIXED_OUTSIDE_WORK_WINDOW" },
    ]);
  });

  it("accepts a fixed candidate exactly on both work-window boundaries", () => {
    const result = buildDeterministicPlan(
      input({
        bufferMinutes: 0,
        candidates: [
          {
            kind: "fixed",
            semanticRef: "fixed-exact",
            startAt: "2026-07-20T01:00:00Z",
            endAt: "2026-07-20T09:00:00Z",
          },
        ],
      }),
    );

    expect(result.placed).toEqual([
      {
        semanticRef: "fixed-exact",
        startAt: "2026-07-20T01:00:00Z",
        endAt: "2026-07-20T09:00:00Z",
      },
    ]);
  });

  it("rejects every overlapping fixed candidate instead of choosing one", () => {
    const result = buildDeterministicPlan(
      input({
        bufferMinutes: 0,
        candidates: [
          {
            kind: "fixed",
            semanticRef: "fixed-a",
            startAt: "2026-07-20T02:00:00Z",
            endAt: "2026-07-20T03:00:00Z",
          },
          {
            kind: "fixed",
            semanticRef: "fixed-b",
            startAt: "2026-07-20T02:30:00Z",
            endAt: "2026-07-20T03:30:00Z",
          },
        ],
      }),
    );

    expect(result.placed).toEqual([]);
    expect(result.conflicts).toEqual([
      { semanticRef: "fixed-a", code: "FIXED_OVERLAP" },
      { semanticRef: "fixed-b", code: "FIXED_OVERLAP" },
    ]);
  });

  it("rejects a fixed candidate that violates the buffer around a busy interval", () => {
    const result = buildDeterministicPlan(
      input({
        busyIntervals: [
          {
            semanticRef: "meeting",
            startAt: "2026-07-20T02:00:00Z",
            endAt: "2026-07-20T03:00:00Z",
          },
        ],
        bufferMinutes: 15,
        candidates: [
          {
            kind: "fixed",
            semanticRef: "too-close",
            startAt: "2026-07-20T03:10:00Z",
            endAt: "2026-07-20T03:40:00Z",
          },
        ],
      }),
    );

    expect(result.conflicts).toEqual([{ semanticRef: "too-close", code: "FIXED_BUFFER_CONFLICT" }]);
  });

  it("rejects a fixed candidate that overlaps a busy interval", () => {
    const result = buildDeterministicPlan(
      input({
        busyIntervals: [
          {
            semanticRef: "meeting",
            startAt: "2026-07-20T02:00:00Z",
            endAt: "2026-07-20T03:00:00Z",
          },
        ],
        bufferMinutes: 0,
        candidates: [
          {
            kind: "fixed",
            semanticRef: "overlapping",
            startAt: "2026-07-20T02:30:00Z",
            endAt: "2026-07-20T03:30:00Z",
          },
        ],
      }),
    );

    expect(result.placed).toEqual([]);
    expect(result.conflicts).toEqual([{ semanticRef: "overlapping", code: "FIXED_OVERLAP" }]);
  });

  it("distinguishes deadline-blocked capacity from impossible constraints", () => {
    const result = buildDeterministicPlan(
      input({
        workWindows: [{ localDate: "2026-07-20", startTime: "09:00", endTime: "12:00" }],
        busyIntervals: [
          {
            semanticRef: "meeting",
            startAt: "2026-07-20T01:00:00Z",
            endAt: "2026-07-20T02:30:00Z",
          },
        ],
        bufferMinutes: 0,
        candidates: [
          {
            kind: "flexible",
            semanticRef: "blocked",
            durationMinutes: 60,
            deadlineAt: "2026-07-20T03:00:00Z",
          },
          {
            kind: "flexible",
            semanticRef: "impossible",
            durationMinutes: 90,
            earliestStartAt: "2026-07-20T03:00:00Z",
            deadlineAt: "2026-07-20T04:00:00Z",
          },
        ],
      }),
    );

    expect(result.overflow).toEqual([{ semanticRef: "blocked", reason: "DEADLINE_BLOCKED" }]);
    expect(result.conflicts).toEqual([{ semanticRef: "impossible", code: "IMPOSSIBLE_CONSTRAINTS" }]);
  });

  it("rejects overlapping work windows before allocating any candidate", () => {
    const result = buildDeterministicPlan(
      input({
        workWindows: [
          { localDate: "2026-07-20", startTime: "09:00", endTime: "12:00" },
          { localDate: "2026-07-20", startTime: "11:00", endTime: "13:00" },
        ],
        candidates: [{ kind: "flexible", semanticRef: "not-placed", durationMinutes: 30 }],
      }),
    );

    expect(result).toEqual({
      placed: [],
      overflow: [],
      conflicts: [{ semanticRef: null, code: "OVERLAPPING_WORK_WINDOWS" }],
    });
  });

  it("preserves candidate order in the result even when fixed capacity is reserved first", () => {
    const result = buildDeterministicPlan(
      input({
        bufferMinutes: 0,
        candidates: [
          { kind: "flexible", semanticRef: "first-input", durationMinutes: 30 },
          {
            kind: "fixed",
            semanticRef: "second-input",
            startAt: "2026-07-20T01:00:00Z",
            endAt: "2026-07-20T01:30:00Z",
          },
        ],
      }),
    );

    expect(result.placed.map((block) => block.semanticRef)).toEqual(["first-input", "second-input"]);
    expect(result.placed[0]?.startAt).toBe("2026-07-20T01:30:00Z");
  });

  it("rejects every occurrence of a duplicate semantic reference", () => {
    const result = buildDeterministicPlan(
      input({
        candidates: [
          { kind: "flexible", semanticRef: "duplicate", durationMinutes: 30 },
          { kind: "flexible", semanticRef: "duplicate", durationMinutes: 45 },
        ],
      }),
    );

    expect(result.placed).toEqual([]);
    expect(result.conflicts).toEqual([
      { semanticRef: "duplicate", code: "DUPLICATE_SEMANTIC_REF" },
      { semanticRef: "duplicate", code: "DUPLICATE_SEMANTIC_REF" },
    ]);
  });
});
