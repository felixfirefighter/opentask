import { describe, expect, it } from "vitest";

import { chooseTaskTreeDeletionInstant } from "./deletion-event-policy";

describe("task-tree deletion event policy", () => {
  it("preserves the preferred instant when no direct child already owns it", () => {
    const preferred = new Date("2026-07-19T01:02:03.000Z");

    expect(chooseTaskTreeDeletionInstant(preferred, [new Date("2026-07-19T01:02:02.999Z")])).toEqual(
      preferred,
    );
  });

  it("chooses the first representable unoccupied millisecond for a same-clock collision", () => {
    const preferred = new Date("2026-07-19T01:02:03.000Z");

    expect(
      chooseTaskTreeDeletionInstant(preferred, [
        preferred,
        new Date("2026-07-19T01:02:03.001Z"),
        new Date("2026-07-19T01:02:03.003Z"),
      ]),
    ).toEqual(new Date("2026-07-19T01:02:03.002Z"));
  });

  it("always returns a valid instant outside the occupied set across bounded collision shapes", () => {
    const preferredMilliseconds = new Date("2026-07-19T01:02:03.000Z").getTime();

    for (let width = 0; width < 64; width += 1) {
      const occupied = Array.from({ length: width }, (_, offset) => new Date(preferredMilliseconds + offset));
      const chosen = chooseTaskTreeDeletionInstant(new Date(preferredMilliseconds), occupied);

      expect(Number.isFinite(chosen.getTime())).toBe(true);
      expect(occupied.some((instant) => instant.getTime() === chosen.getTime())).toBe(false);
      expect(chosen.getTime()).toBe(preferredMilliseconds + width);
    }
  });

  it("rejects invalid internal instants", () => {
    expect(() => chooseTaskTreeDeletionInstant(new Date(Number.NaN), [])).toThrow(RangeError);
    expect(() => chooseTaskTreeDeletionInstant(new Date(), [new Date(Number.NaN)])).toThrow(RangeError);
  });
});
