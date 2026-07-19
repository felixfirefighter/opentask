import type { PlannerAction, PlannerProposalDto } from "../application/contracts";

import { PlannerProposalCard } from "./PlannerProposalCard";
import { PlannerProposalGroup } from "./PlannerProposalGroup";
import { isActionEditable, targetTitle, type ReviewGroupId } from "./planner-review-policy";
import type { PlannerActionIssue } from "./planner-screen-model";
import styles from "./PlannerReviewStep.module.css";

export type ReviewActionEntry = Readonly<{
  action: PlannerAction;
  issues: readonly PlannerActionIssue[];
  overflow: string | null;
  group: ReviewGroupId;
}>;

export const reviewGroupOrder: readonly ReviewGroupId[] = ["attention", "changed", "created", "deferred"];

export function PlannerReviewGroups({
  entries,
  proposal,
  selected,
  operationDisabled,
  onToggle,
  onChange,
}: Readonly<{
  entries: readonly ReviewActionEntry[];
  proposal: PlannerProposalDto;
  selected: ReadonlySet<string>;
  operationDisabled: boolean;
  onToggle: (actionId: string) => void;
  onChange: (action: PlannerAction) => void;
}>) {
  return (
    <div className={styles.groups}>
      {reviewGroupOrder.map((group) => {
        const grouped = entries.filter((entry) => entry.group === group);
        return grouped.length > 0 ? (
          <PlannerProposalGroup group={group} key={group}>
            {grouped.map(({ action, issues, overflow }) => (
              <PlannerProposalCard
                key={action.actionId}
                action={action}
                target={targetTitle(action, proposal.proposal)}
                selected={selected.has(action.actionId)}
                issues={issues}
                overflow={overflow}
                planningDate={proposal.planningDate}
                planningContext={proposal.proposal.planningContext}
                operationDisabled={operationDisabled}
                editable={isActionEditable(action)}
                onToggle={() => onToggle(action.actionId)}
                onChange={onChange}
              />
            ))}
          </PlannerProposalGroup>
        ) : null;
      })}
    </div>
  );
}
