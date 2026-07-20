import { describe, expect, it } from "vitest";

import {
  decideOccurrenceState,
  effectiveOccurrenceState,
  latestOccurrenceEvent,
  MAX_OCCURRENCE_TASK_VERSION,
} from "./occurrence-state-policy";

describe("occurrence state policy", () => {
  it("defaults to open and orders immutable events only by post-command task version", () => {
    expect(effectiveOccurrenceState([])).toBe("open");
    const events = [
      { state: "open", taskVersion: 9 },
      { state: "completed", taskVersion: 4 },
      { state: "skipped", taskVersion: 7 },
    ] as const;
    expect(effectiveOccurrenceState(events)).toBe("open");
    expect(latestOccurrenceEvent(events)).toEqual({ state: "open", taskVersion: 9 });
  });

  it("appends a changed state at expectedVersion + 1", () => {
    expect(
      decideOccurrenceState({
        currentTaskVersion: 5,
        expectedVersion: 5,
        targetState: "completed",
        events: [],
      }),
    ).toEqual({ kind: "append", event: { state: "completed", taskVersion: 6 } });
  });

  it("makes an already-effective state a no-op without incrementing", () => {
    expect(
      decideOccurrenceState({
        currentTaskVersion: 8,
        expectedVersion: 8,
        targetState: "skipped",
        events: [{ state: "skipped", taskVersion: 7 }],
      }),
    ).toEqual({ kind: "no_op", state: "skipped" });
    expect(
      decideOccurrenceState({
        currentTaskVersion: 8,
        expectedVersion: 8,
        targetState: "open",
        events: [],
      }),
    ).toEqual({ kind: "no_op", state: "open" });
  });

  it("recognizes an exact response-lost replay after unrelated task versions advance", () => {
    expect(
      decideOccurrenceState({
        currentTaskVersion: 12,
        expectedVersion: 5,
        targetState: "completed",
        events: [{ state: "completed", taskVersion: 6 }],
      }),
    ).toEqual({ kind: "replay", event: { state: "completed", taskVersion: 6 } });
  });

  it("keeps all non-exact stale writes as conflicts", () => {
    expect(
      decideOccurrenceState({
        currentTaskVersion: 7,
        expectedVersion: 5,
        targetState: "skipped",
        events: [{ state: "completed", taskVersion: 6 }],
      }),
    ).toEqual({ kind: "stale" });
    expect(
      decideOccurrenceState({
        currentTaskVersion: 9,
        expectedVersion: 5,
        targetState: "completed",
        events: [
          { state: "completed", taskVersion: 6 },
          { state: "open", taskVersion: 8 },
        ],
      }),
    ).toEqual({ kind: "stale" });
  });

  it("rejects impossible event histories and version overflow", () => {
    expect(() =>
      decideOccurrenceState({
        currentTaskVersion: 5,
        expectedVersion: 5,
        targetState: "completed",
        events: [{ state: "skipped", taskVersion: 6 }],
      }),
    ).toThrow(RangeError);
    expect(() =>
      latestOccurrenceEvent([
        { state: "completed", taskVersion: 4 },
        { state: "skipped", taskVersion: 4 },
      ]),
    ).toThrow(RangeError);
    expect(() =>
      decideOccurrenceState({
        currentTaskVersion: MAX_OCCURRENCE_TASK_VERSION,
        expectedVersion: MAX_OCCURRENCE_TASK_VERSION,
        targetState: "completed",
        events: [],
      }),
    ).toThrow(RangeError);
  });
});
