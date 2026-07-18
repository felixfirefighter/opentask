import { describe, expect, it } from "vitest";

import { planRankPlacement, RankPlacementError } from "./ranked-placement";

describe("ranked placement", () => {
  const siblings = [
    { id: "first", rank: "a0" },
    { id: "second", rank: "a1" },
    { id: "third", rank: "a2" },
  ];

  it("places at the start, end, before, and after without exposing raw ranks", () => {
    expect(planRankPlacement(siblings, "new", { kind: "start" }).rank < "a0").toBe(true);
    expect(planRankPlacement(siblings, "new", { kind: "end" }).rank > "a2").toBe(true);
    const before = planRankPlacement(siblings, "new", { kind: "before", anchorId: "second" }).rank;
    expect(before > "a0" && before < "a1").toBe(true);
    const after = planRankPlacement(siblings, "new", { kind: "after", anchorId: "second" }).rank;
    expect(after > "a1" && after < "a2").toBe(true);
  });

  it("removes an existing target before calculating its new position", () => {
    const plan = planRankPlacement(siblings, "first", { kind: "after", anchorId: "third" });
    expect(plan.rank > "a2").toBe(true);
  });

  it("rejects missing and self anchors", () => {
    expect(() => planRankPlacement(siblings, "first", { kind: "after", anchorId: "first" })).toThrow(
      RankPlacementError,
    );
    expect(() => planRankPlacement(siblings, "new", { kind: "before", anchorId: "missing" })).toThrow(
      expect.objectContaining({ reason: "ANCHOR_NOT_FOUND" }),
    );
  });
});
