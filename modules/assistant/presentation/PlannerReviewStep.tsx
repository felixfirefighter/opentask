"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  plannerActionSchema,
  type PlannerAction,
  type PlannerProposalDto,
  type PlannerSelection,
} from "../application/contracts";
import { Button } from "@/shared/presentation";

import { PlannerApplyBar } from "./PlannerApplyBar";
import { PlannerFailureBanner } from "./PlannerConditionPanel";
import { PlannerDiscardPrompt } from "./PlannerDiscardPrompt";
import { groupForAction, issuesForAction, overflowMessage } from "./planner-review-policy";
import { PlannerReviewGroups, reviewGroupOrder } from "./PlannerReviewGroups";
import { PlannerReviewSummary } from "./PlannerReviewSummary";
import type { PlannerActionIssue, PlannerFailure } from "./planner-screen-model";
import { usePlannerReviewNavigationGuard } from "./use-planner-review-navigation-guard";
import styles from "./PlannerReviewStep.module.css";

export function PlannerReviewStep(
  props: Readonly<{
    proposal: PlannerProposalDto;
    operation: "idle" | "applying" | "rejecting" | "revalidating";
    issues: readonly PlannerActionIssue[];
    failure?: PlannerFailure | undefined;
    online: boolean;
    onApply: (selection: PlannerSelection) => void;
    onReject: (proposalId: string) => void;
    onRetry: () => void;
    onEditInput: () => void;
  }>,
) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [actions, setActions] = useState<readonly PlannerAction[]>(props.proposal.proposal.actions);
  const externalIssues = useMemo(
    () =>
      props.failure?.kind === "stale"
        ? [
            ...props.issues,
            {
              kind: "stale" as const,
              message: "This proposal must be regenerated before it can be applied.",
            },
          ]
        : props.issues,
    [props.failure?.kind, props.issues],
  );
  const [selected, setSelected] = useState(
    () =>
      new Set(
        props.proposal.proposal.actions
          .filter((action) => issuesForAction(action, props.proposal.proposal, externalIssues).length === 0)
          .map(({ actionId }) => actionId),
      ),
  );
  const [initialActions] = useState(actions);
  const [initialSelected] = useState(selected);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const busy = props.operation !== "idle";
  const dirty =
    JSON.stringify(actions) !== JSON.stringify(initialActions) || !sameSelection(selected, initialSelected);

  usePlannerReviewNavigationGuard(dirty && props.proposal.status === "pending", resetLocalReview);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const actionEntries = useMemo(
    () =>
      actions.map((action) => {
        const issues = [...issuesForAction(action, props.proposal.proposal, externalIssues)];
        const group = groupForAction(action, props.proposal.proposal, issues);
        const parsed = plannerActionSchema.safeParse(action);
        if (!parsed.success)
          issues.push({
            actionId: action.actionId,
            kind: "invalid",
            message: parsed.error.issues[0]?.message ?? "Finish this edit before applying.",
          });
        return { action, issues, group, overflow: overflowMessage(action, props.proposal.proposal) };
      }),
    [actions, externalIssues, props.proposal.proposal],
  );

  const applicable = actionEntries.filter(
    ({ action, issues }) => selected.has(action.actionId) && issues.length === 0,
  );
  const groups = new Map(
    reviewGroupOrder.map((group) => [group, actionEntries.filter((entry) => entry.group === group)]),
  );
  const counts = {
    proposed: actions.length,
    attention: groups.get("attention")?.length ?? 0,
    deferred: groups.get("deferred")?.length ?? 0,
    uncertain:
      props.proposal.proposal.uncertainties.length +
      actions.filter(({ uncertainties }) => uncertainties.length > 0).length,
  };

  function editInput() {
    if (dirty) setConfirmDiscard(true);
    else props.onEditInput();
  }

  function resetLocalReview() {
    setActions(initialActions);
    setSelected(new Set(initialSelected));
  }

  function discardEdits() {
    props.onEditInput();
  }

  function keepReviewing() {
    setConfirmDiscard(false);
    headingRef.current?.focus();
  }

  function apply() {
    props.onApply({
      proposalId: props.proposal.id,
      applyToken: props.proposal.applyToken,
      actions: applicable.map(({ action }) => action),
    });
  }

  return (
    <>
      {props.failure ? (
        <PlannerFailureBanner
          failure={props.failure}
          retryDisabled={!props.online}
          onRetry={props.onRetry}
          onEditInput={editInput}
        />
      ) : null}
      <PlannerReviewSummary proposal={props.proposal.proposal} counts={counts} onEditInput={editInput} />
      {actions.length === 0 ? (
        <section className={styles.empty} aria-labelledby="empty-proposal-heading">
          <h2 id="empty-proposal-heading" ref={headingRef} tabIndex={-1}>
            No changes were proposed
          </h2>
          <p>
            The input did not produce an actionable change. Edit it for more detail or continue planning
            manually.
          </p>
          <Button type="button" variant="secondary" onClick={props.onEditInput}>
            Edit input
          </Button>
        </section>
      ) : (
        <>
          <h2 className="sr-only" ref={headingRef} tabIndex={-1}>
            Proposal changes
          </h2>
          <PlannerReviewGroups
            entries={actionEntries}
            proposal={props.proposal}
            selected={selected}
            operationDisabled={busy || !props.online}
            onToggle={(actionId) => {
              setSelected((current) => {
                const next = new Set(current);
                if (next.has(actionId)) next.delete(actionId);
                else next.add(actionId);
                return next;
              });
            }}
            onChange={(nextAction) => {
              setActions((current) =>
                current.map((item) => (item.actionId === nextAction.actionId ? nextAction : item)),
              );
            }}
          />
        </>
      )}

      {confirmDiscard ? (
        <PlannerDiscardPrompt onKeepReviewing={keepReviewing} onDiscard={discardEdits} />
      ) : null}

      {actions.length > 0 ? (
        <PlannerApplyBar
          selectedCount={applicable.length}
          online={props.online}
          operation={props.operation}
          onApply={apply}
          onReject={() => props.onReject(props.proposal.id)}
          onRevalidate={props.onRetry}
        />
      ) : null}
    </>
  );
}

function sameSelection(current: ReadonlySet<string>, initial: ReadonlySet<string>): boolean {
  return current.size === initial.size && [...current].every((actionId) => initial.has(actionId));
}
