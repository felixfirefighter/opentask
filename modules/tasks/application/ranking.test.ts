import { describe, expect, it } from "vitest";

import {
  RANK_MAX_LENGTH,
  RANK_REBALANCE_MAX_ITEMS,
  RANK_REBALANCE_TRIGGER_LENGTH,
  assertValidRank,
  compareRankedIdentifiers,
  generateRankAfter,
  generateRankBefore,
  generateRankBetween,
  generateRanksBetween,
  shouldRebalanceRank,
} from "./ranking";

describe("fractional rank application policy", () => {
  it("generates before, between, and after ranks in strict lexical order", () => {
    const first = "a0";
    const after = generateRankAfter(first);
    const between = generateRankBetween(first, after);
    const before = generateRankBefore(first);

    expect(before < first).toBe(true);
    expect(first < between).toBe(true);
    expect(between < after).toBe(true);
    expect([before, first, between, after].toSorted()).toEqual([before, first, between, after]);
  });

  it("rejects equal, reversed, malformed, empty, and oversized neighbors", () => {
    expect(() => generateRankBetween("a0", "a0")).toThrowError(
      expect.objectContaining({ reason: "NEIGHBORS_NOT_ORDERED" }),
    );
    expect(() => generateRankBetween("a1", "a0")).toThrowError(
      expect.objectContaining({ reason: "NEIGHBORS_NOT_ORDERED" }),
    );
    expect(() => assertValidRank("")).toThrowError(expect.objectContaining({ reason: "INVALID_RANK" }));
    expect(() => assertValidRank("not a rank")).toThrowError(
      expect.objectContaining({ reason: "INVALID_RANK" }),
    );
    expect(() => assertValidRank("a0!")).toThrowError(expect.objectContaining({ reason: "INVALID_RANK" }));
    expect(() => assertValidRank(`a0${"V".repeat(RANK_MAX_LENGTH - 1)}`)).toThrowError(
      expect.objectContaining({ reason: "RANK_CAPACITY_EXCEEDED" }),
    );
  });

  it("triggers rebalance only above 64 characters and accepts at most 128", () => {
    const atTrigger = `a0${"V".repeat(RANK_REBALANCE_TRIGGER_LENGTH - 2)}`;
    const aboveTrigger = `${atTrigger}V`;
    const atMaximum = `a0${"V".repeat(RANK_MAX_LENGTH - 2)}`;

    expect(shouldRebalanceRank(atTrigger)).toBe(false);
    expect(shouldRebalanceRank(aboveTrigger)).toBe(true);
    expect(shouldRebalanceRank(atMaximum)).toBe(true);
  });

  it("generates a sorted bounded batch between outer neighbors", () => {
    const ranks = generateRanksBetween("a0", "a1", RANK_REBALANCE_MAX_ITEMS);

    expect(ranks).toHaveLength(RANK_REBALANCE_MAX_ITEMS);
    expect(ranks.every((rank) => rank > "a0" && rank < "a1")).toBe(true);
    expect(ranks.every((rank, index) => index === 0 || ranks[index - 1]! < rank)).toBe(true);
    expect(ranks.every((rank) => rank.length <= RANK_MAX_LENGTH)).toBe(true);
  });

  it("rejects non-positive, fractional, unsafe, and over-limit rebalance counts", () => {
    for (const count of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, RANK_REBALANCE_MAX_ITEMS + 1]) {
      expect(() => generateRanksBetween(null, null, count)).toThrowError(
        expect.objectContaining({ reason: "REBALANCE_LIMIT_EXCEEDED" }),
      );
    }
  });

  it("orders equal ranks deterministically by opaque id without locale comparison", () => {
    const rows = [
      { id: "task-b", rank: "a0" },
      { id: "task-c", rank: "a1" },
      { id: "task-a", rank: "a0" },
    ];

    expect(rows.toSorted(compareRankedIdentifiers)).toEqual([
      { id: "task-a", rank: "a0" },
      { id: "task-b", rank: "a0" },
      { id: "task-c", rank: "a1" },
    ]);
  });
});
