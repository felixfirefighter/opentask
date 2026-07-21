import type { PlannerAction, PlannerProposalDto } from "../application/contracts";

import { targetTitle } from "./planner-review-policy";
import type { PlannerTaskLink } from "./planner-screen-model";

export function plannerProposalHref(proposalId: string): string {
  return `/plan?proposal=${encodeURIComponent(proposalId)}`;
}

export function plannerTaskHref(taskId: string, proposalId: string): string {
  const returnTo = plannerProposalHref(proposalId);
  return `/tasks/${encodeURIComponent(taskId)}?returnTo=${encodeURIComponent(returnTo)}`;
}

export function taskLinksForAppliedSelection(
  proposal: PlannerProposalDto,
  actions: readonly PlannerAction[],
): readonly PlannerTaskLink[] {
  const links = new Map<string, PlannerTaskLink>();

  for (const action of actions) {
    if (action.kind === "defer") continue;
    const id = action.kind === "create" ? action.actionId : action.taskId;
    const title = action.kind === "create" ? action.after.title : targetTitle(action, proposal.proposal);
    links.set(id, { id, title });
  }

  for (const action of actions) {
    if (action.kind !== "update") continue;
    links.set(action.taskId, { id: action.taskId, title: action.after.title });
  }

  return [...links.values()].sort((left, right) => left.title.localeCompare(right.title));
}
