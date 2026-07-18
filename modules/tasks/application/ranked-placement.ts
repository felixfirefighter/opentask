import type { Placement } from "./contracts/contract-primitives";
import {
  compareRankedIdentifiers,
  generateRankAfter,
  generateRankBefore,
  generateRankBetween,
  generateRanksBetween,
  RANK_REBALANCE_MAX_ITEMS,
  shouldRebalanceRank,
  type RankedIdentifier,
} from "./ranking";

export type RankPlacementPlan = Readonly<{
  rank: string;
  rebalance: readonly RankedIdentifier[] | null;
}>;

export class RankPlacementError extends Error {
  readonly reason: "ANCHOR_NOT_FOUND" | "TARGET_IS_ANCHOR" | "REBALANCE_LIMIT_EXCEEDED";

  constructor(reason: RankPlacementError["reason"]) {
    super("The requested placement is no longer available.");
    this.name = "RankPlacementError";
    this.reason = reason;
  }
}

export function planRankPlacement(
  siblings: readonly RankedIdentifier[],
  targetId: string,
  placement: Placement,
): RankPlacementPlan {
  const ordered = siblings.filter((sibling) => sibling.id !== targetId).toSorted(compareRankedIdentifiers);
  const insertionIndex = findInsertionIndex(ordered, targetId, placement);
  const previous = ordered[insertionIndex - 1]?.rank ?? null;
  const next = ordered[insertionIndex]?.rank ?? null;
  const rank = generateAt(previous, next);

  if (!shouldRebalanceRank(rank)) return { rank, rebalance: null };
  const itemCount = ordered.length + 1;
  if (itemCount > RANK_REBALANCE_MAX_ITEMS) {
    return { rank, rebalance: null };
  }

  const desiredIds = ordered.map((sibling) => sibling.id);
  desiredIds.splice(insertionIndex, 0, targetId);
  const ranks = generateRanksBetween(null, null, desiredIds.length);
  const rebalance = desiredIds.map((id, index) => ({ id, rank: requiredRank(ranks[index]) }));
  return { rank: requiredRank(rebalance.find((entry) => entry.id === targetId)?.rank), rebalance };
}

function findInsertionIndex(
  ordered: readonly RankedIdentifier[],
  targetId: string,
  placement: Placement,
): number {
  if (placement.kind === "start") return 0;
  if (placement.kind === "end") return ordered.length;
  if (placement.anchorId === targetId) throw new RankPlacementError("TARGET_IS_ANCHOR");

  const anchorIndex = ordered.findIndex((sibling) => sibling.id === placement.anchorId);
  if (anchorIndex < 0) throw new RankPlacementError("ANCHOR_NOT_FOUND");
  return placement.kind === "before" ? anchorIndex : anchorIndex + 1;
}

function generateAt(previous: string | null, next: string | null): string {
  if (previous === null && next === null) return requiredRank(generateRanksBetween(null, null, 1)[0]);
  if (previous === null) return generateRankBefore(requiredRank(next));
  if (next === null) return generateRankAfter(previous);
  return generateRankBetween(previous, next);
}

function requiredRank(rank: string | undefined | null): string {
  if (!rank) throw new RankPlacementError("REBALANCE_LIMIT_EXCEEDED");
  return rank;
}
