import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

export const RANK_REBALANCE_TRIGGER_LENGTH = 64;
export const RANK_MAX_LENGTH = 128;
export const RANK_REBALANCE_MAX_ITEMS = 500;
const rankCharacters = /^[0-9A-Za-z]+$/;

export type RankedIdentifier = Readonly<{ id: string; rank: string }>;

export type RankPolicyFailure =
  "INVALID_RANK" | "NEIGHBORS_NOT_ORDERED" | "RANK_CAPACITY_EXCEEDED" | "REBALANCE_LIMIT_EXCEEDED";

export class RankPolicyError extends Error {
  readonly reason: RankPolicyFailure;

  constructor(reason: RankPolicyFailure) {
    super("The requested rank operation is not valid.");
    this.name = "RankPolicyError";
    this.reason = reason;
  }
}

export function generateRankBefore(nextRank: string): string {
  assertValidRank(nextRank);
  return generateCheckedRank(null, nextRank);
}

export function generateRankBetween(previousRank: string, nextRank: string): string {
  assertOrderedNeighbors(previousRank, nextRank);
  return generateCheckedRank(previousRank, nextRank);
}

export function generateRankAfter(previousRank: string): string {
  assertValidRank(previousRank);
  return generateCheckedRank(previousRank, null);
}

export function generateRanksBetween(
  previousRank: string | null,
  nextRank: string | null,
  count: number,
): readonly string[] {
  assertRebalanceCount(count);
  assertNullableNeighbors(previousRank, nextRank);

  let ranks: string[];
  try {
    ranks = generateNKeysBetween(previousRank, nextRank, count);
  } catch {
    throw new RankPolicyError("RANK_CAPACITY_EXCEEDED");
  }

  for (const rank of ranks) assertGeneratedRank(rank);
  return ranks;
}

export function shouldRebalanceRank(rank: string): boolean {
  assertValidRank(rank);
  return rank.length > RANK_REBALANCE_TRIGGER_LENGTH;
}

export function assertValidRank(rank: string): void {
  if (rank.length === 0 || !rankCharacters.test(rank)) {
    throw new RankPolicyError("INVALID_RANK");
  }
  if (rank.length > RANK_MAX_LENGTH) throw new RankPolicyError("RANK_CAPACITY_EXCEEDED");

  try {
    generateKeyBetween(null, rank);
  } catch {
    throw new RankPolicyError("INVALID_RANK");
  }
}

export function compareRankedIdentifiers(left: RankedIdentifier, right: RankedIdentifier): number {
  assertValidRank(left.rank);
  assertValidRank(right.rank);
  if (left.rank < right.rank) return -1;
  if (left.rank > right.rank) return 1;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

function assertNullableNeighbors(previousRank: string | null, nextRank: string | null): void {
  if (previousRank !== null && nextRank !== null) {
    assertOrderedNeighbors(previousRank, nextRank);
    return;
  }
  if (previousRank !== null) assertValidRank(previousRank);
  if (nextRank !== null) assertValidRank(nextRank);
}

function assertOrderedNeighbors(previousRank: string, nextRank: string): void {
  assertValidRank(previousRank);
  assertValidRank(nextRank);
  if (previousRank >= nextRank) throw new RankPolicyError("NEIGHBORS_NOT_ORDERED");
}

function assertRebalanceCount(count: number): void {
  if (!Number.isSafeInteger(count) || count < 1 || count > RANK_REBALANCE_MAX_ITEMS) {
    throw new RankPolicyError("REBALANCE_LIMIT_EXCEEDED");
  }
}

function generateCheckedRank(previousRank: string | null, nextRank: string | null): string {
  let rank: string;
  try {
    rank = generateKeyBetween(previousRank, nextRank);
  } catch {
    throw new RankPolicyError("RANK_CAPACITY_EXCEEDED");
  }
  assertGeneratedRank(rank);
  return rank;
}

function assertGeneratedRank(rank: string): void {
  if (rank.length > RANK_MAX_LENGTH) throw new RankPolicyError("RANK_CAPACITY_EXCEEDED");
  assertValidRank(rank);
}
