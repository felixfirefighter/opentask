import type { DatabaseExecutor } from "@/shared/db/client";

import type { Placement } from "./contracts";
import { planRankPlacement, RankPlacementError, type RankPlacementPlan } from "./ranked-placement";
import { RankPolicyError } from "./ranking";
import { taskConflict } from "./task-errors";
import { lockRankScope } from "../infrastructure/rank-scope-lock";

export async function planLockedRank(
  executor: DatabaseExecutor,
  scope: readonly [string, ...string[]],
  loadSiblings: () => Promise<readonly { id: string; rank: string }[]>,
  targetId: string,
  placement: Placement,
): Promise<RankPlacementPlan> {
  await lockRankScope(executor, scope);
  try {
    const siblings = await loadSiblings();
    return planRankPlacement(siblings, targetId, placement);
  } catch (error) {
    if (error instanceof RankPlacementError || error instanceof RankPolicyError) {
      throw taskConflict("The requested position is no longer available. Refresh and try again.");
    }
    throw error;
  }
}

export function siblingRebalance(
  plan: RankPlacementPlan,
  targetId: string,
): readonly { id: string; rank: string }[] {
  return plan.rebalance?.filter((entry) => entry.id !== targetId) ?? [];
}
