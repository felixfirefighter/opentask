import type { SchedulingInput, SchedulingResult } from "./scheduling-contract";

type SchedulerGoldenFixture = Readonly<{
  input: SchedulingInput;
  expected: SchedulingResult;
}>;

export const schedulerGoldenFixtures = {
  vague: {
    input: {
      timeZone: "Asia/Singapore",
      workWindows: [{ localDate: "2026-07-20", startTime: "09:00", endTime: "12:00" }],
      busyIntervals: [],
      bufferMinutes: 10,
      candidates: [{ kind: "flexible", semanticRef: "new-vague", durationMinutes: 30 }],
    },
    expected: {
      placed: [
        {
          semanticRef: "new-vague",
          startAt: "2026-07-20T01:00:00Z",
          endAt: "2026-07-20T01:30:00Z",
        },
      ],
      overflow: [],
      conflicts: [],
    },
  },
  multiple: {
    input: {
      timeZone: "Asia/Singapore",
      workWindows: [{ localDate: "2026-07-20", startTime: "09:00", endTime: "13:00" }],
      busyIntervals: [],
      bufferMinutes: 15,
      candidates: [
        { kind: "flexible", semanticRef: "selected-1", durationMinutes: 45 },
        { kind: "flexible", semanticRef: "new-1", durationMinutes: 30 },
        { kind: "flexible", semanticRef: "new-2", durationMinutes: 60 },
      ],
    },
    expected: {
      placed: [
        {
          semanticRef: "selected-1",
          startAt: "2026-07-20T01:00:00Z",
          endAt: "2026-07-20T01:45:00Z",
        },
        {
          semanticRef: "new-1",
          startAt: "2026-07-20T02:00:00Z",
          endAt: "2026-07-20T02:30:00Z",
        },
        {
          semanticRef: "new-2",
          startAt: "2026-07-20T02:45:00Z",
          endAt: "2026-07-20T03:45:00Z",
        },
      ],
      overflow: [],
      conflicts: [],
    },
  },
  fixed: {
    input: {
      timeZone: "Asia/Singapore",
      workWindows: [{ localDate: "2026-07-20", startTime: "09:00", endTime: "13:00" }],
      busyIntervals: [
        {
          semanticRef: "existing-meeting",
          startAt: "2026-07-20T01:45:00Z",
          endAt: "2026-07-20T02:30:00Z",
        },
      ],
      bufferMinutes: 15,
      candidates: [
        { kind: "flexible", semanticRef: "selected-1", durationMinutes: 45 },
        {
          kind: "fixed",
          semanticRef: "new-fixed",
          startAt: "2026-07-20T03:45:00Z",
          endAt: "2026-07-20T04:15:00Z",
        },
      ],
    },
    expected: {
      placed: [
        {
          semanticRef: "selected-1",
          startAt: "2026-07-20T02:45:00Z",
          endAt: "2026-07-20T03:30:00Z",
        },
        {
          semanticRef: "new-fixed",
          startAt: "2026-07-20T03:45:00Z",
          endAt: "2026-07-20T04:15:00Z",
        },
      ],
      overflow: [],
      conflicts: [],
    },
  },
  overflow: {
    input: {
      timeZone: "Asia/Singapore",
      workWindows: [{ localDate: "2026-07-20", startTime: "09:00", endTime: "10:00" }],
      busyIntervals: [],
      bufferMinutes: 10,
      candidates: [
        { kind: "flexible", semanticRef: "selected-1", durationMinutes: 30 },
        { kind: "flexible", semanticRef: "selected-2", durationMinutes: 30 },
      ],
    },
    expected: {
      placed: [
        {
          semanticRef: "selected-1",
          startAt: "2026-07-20T01:00:00Z",
          endAt: "2026-07-20T01:30:00Z",
        },
      ],
      overflow: [{ semanticRef: "selected-2", reason: "NO_FREE_INTERVAL" }],
      conflicts: [],
    },
  },
  impossible: {
    input: {
      timeZone: "Asia/Singapore",
      workWindows: [{ localDate: "2026-07-20", startTime: "09:00", endTime: "10:00" }],
      busyIntervals: [],
      bufferMinutes: 0,
      candidates: [{ kind: "flexible", semanticRef: "new-1", durationMinutes: 61 }],
    },
    expected: {
      placed: [],
      overflow: [],
      conflicts: [{ semanticRef: "new-1", code: "IMPOSSIBLE_CONSTRAINTS" }],
    },
  },
  irrelevant: {
    input: {
      timeZone: "Asia/Singapore",
      workWindows: [{ localDate: "2026-07-20", startTime: "09:00", endTime: "17:00" }],
      busyIntervals: [],
      bufferMinutes: 10,
      candidates: [],
    },
    expected: { placed: [], overflow: [], conflicts: [] },
  },
} satisfies Record<string, SchedulerGoldenFixture>;
