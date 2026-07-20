import { describe, expect, it } from "vitest";

import { createOccurrenceKey, decodeOccurrenceKey, OCCURRENCE_KEY_MAX_LENGTH } from "./occurrence-key";

const taskId = "3f83c816-8db5-4fca-8cd6-4dfa924b7770";

describe("occurrence identity codec", () => {
  it("round-trips a stable, bounded all-day identity", () => {
    const key = createOccurrenceKey(taskId.toUpperCase(), {
      kind: "all_day",
      startDate: "2026-07-20",
    });
    expect(key).toBe(createOccurrenceKey(taskId, { kind: "all_day", startDate: "2026-07-20" }));
    expect(key.startsWith("o1.")).toBe(true);
    expect(key.length).toBeLessThanOrEqual(OCCURRENCE_KEY_MAX_LENGTH);
    expect(decodeOccurrenceKey(key, taskId)).toEqual({
      taskId,
      kind: "all_day",
      startDate: "2026-07-20",
    });
  });

  it("uses canonical epoch milliseconds so equivalent instant spellings share an identity", () => {
    const utc = createOccurrenceKey(taskId, { kind: "timed", startAt: "2026-07-20T01:30:00Z" });
    const offset = createOccurrenceKey(taskId, {
      kind: "timed",
      startAt: "2026-07-20T09:30:00+08:00",
    });
    expect(offset).toBe(utc);
    expect(decodeOccurrenceKey(utc)).toEqual({
      taskId,
      kind: "timed",
      epochMilliseconds: 1_784_511_000_000,
      startAt: "2026-07-20T01:30:00Z",
    });
  });

  it("rejects cross-task, malformed, noncanonical, and sub-millisecond identities", () => {
    expect(() =>
      decodeOccurrenceKey(
        createOccurrenceKey(taskId, { kind: "all_day", startDate: "2026-07-20" }),
        "5f2ac8a3-266b-43e7-8f79-46167419e1d1",
      ),
    ).toThrow(RangeError);
    expect(() => decodeOccurrenceKey("o1.not*base64")).toThrow(RangeError);
    const negativeZero = `o1.${btoa(`${taskId}|t|-0`).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`;
    expect(() => decodeOccurrenceKey(negativeZero)).toThrow(RangeError);
    expect(() => createOccurrenceKey(taskId, { kind: "all_day", startDate: "2026-7-20" })).toThrow(
      RangeError,
    );
    expect(() =>
      createOccurrenceKey(taskId, { kind: "timed", startAt: "2026-07-20T01:30:00.000000001Z" }),
    ).toThrow(RangeError);
  });

  it("preserves distant recurrence semantics while reserving maximum-duration projection headroom", () => {
    expect(
      decodeOccurrenceKey(createOccurrenceKey(taskId, { kind: "all_day", startDate: "+100826-01-01" })),
    ).toMatchObject({ kind: "all_day", startDate: "+100826-01-01" });
    expect(() => createOccurrenceKey(taskId, { kind: "all_day", startDate: "+275760-08-13" })).not.toThrow();
    expect(() =>
      createOccurrenceKey(taskId, { kind: "timed", startAt: "+275760-08-13T00:00:00Z" }),
    ).not.toThrow();
    expect(() => createOccurrenceKey(taskId, { kind: "all_day", startDate: "+275760-09-13" })).toThrow(
      "supported recurrence bounds",
    );
    expect(() => createOccurrenceKey(taskId, { kind: "timed", startAt: "+275760-09-13T00:00:00Z" })).toThrow(
      "supported recurrence bounds",
    );

    const extremeKey = encodedOccurrenceKey(`${taskId}|t|8640000000000000`);
    expect(() => decodeOccurrenceKey(extremeKey)).toThrow("supported instant bounds");
  });
});

function encodedOccurrenceKey(payload: string): string {
  return `o1.${btoa(payload).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`;
}
