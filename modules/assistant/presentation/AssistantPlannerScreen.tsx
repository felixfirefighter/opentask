"use client";

import { useState } from "react";

import type { PlannerInput } from "../application/contracts";

import {
  PlannerOfflineBanner,
  PlannerPermissionState,
  PlannerUnavailableState,
} from "./PlannerConditionPanel";
import { PlannerDescribeStep } from "./PlannerDescribeStep";
import { PlannerProcessingState } from "./PlannerProcessingState";
import { PlannerResultStep } from "./PlannerResultStep";
import { PlannerReviewStep } from "./PlannerReviewStep";
import { PlannerTerminalProposalState } from "./PlannerTerminalProposalState";
import type { AssistantPlannerScreenProps } from "./planner-screen-model";
import { PlannerStepIndicator } from "./PlannerStepIndicator";
import styles from "./AssistantPlannerScreen.module.css";

export function AssistantPlannerScreen(props: AssistantPlannerScreenProps) {
  const [draft, setDraft] = useState<PlannerInput>(props.initialInput);
  const step =
    props.state.kind === "result" ||
    props.state.kind === "terminal" ||
    (props.state.kind === "review" && props.state.proposal.status !== "pending")
      ? "result"
      : props.state.kind === "review"
        ? "review"
        : "describe";

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <p className="eyebrow">Reality-aware planner</p>
        <h1 id="page-heading" tabIndex={-1} data-route-focus>
          AI Review
        </h1>
        <p>Turn selected context into a proposal, review every change, then decide what to apply.</p>
      </header>
      <PlannerStepIndicator current={step} />
      {!props.online && props.state.kind !== "permission" ? <PlannerOfflineBanner /> : null}

      {props.state.kind === "permission" ? (
        <PlannerPermissionState />
      ) : props.state.kind === "describe" && props.capability.state === "disabled" ? (
        <PlannerUnavailableState todayHref={props.todayHref} calendarHref={props.calendarHref} />
      ) : props.state.kind === "describe" ? (
        <PlannerDescribeStep
          draft={draft}
          tasks={props.tasks}
          online={props.online}
          failure={props.state.failure}
          onChange={setDraft}
          onSubmit={props.onCreateProposal}
          onRetry={() => props.onRetry(draft)}
        />
      ) : props.state.kind === "processing" ? (
        <PlannerProcessingState stage={props.state.stage} input={props.state.submittedInput} />
      ) : props.state.kind === "review" && props.state.proposal.status !== "pending" ? (
        <PlannerTerminalProposalState
          proposal={props.state.proposal}
          todayHref={props.todayHref}
          calendarHref={props.calendarHref}
          onEditInput={props.onEditInput}
        />
      ) : props.state.kind === "review" ? (
        <PlannerReviewStep
          key={props.state.proposal.id}
          proposal={props.state.proposal}
          operation={props.state.operation ?? "idle"}
          issues={props.state.issues ?? []}
          failure={props.state.failure}
          online={props.online}
          onApply={props.onApply}
          onReject={props.onReject}
          onRetry={props.onRetry}
          onEditInput={props.onEditInput}
        />
      ) : props.state.kind === "result" ? (
        <PlannerResultStep
          proposal={props.state.proposal}
          result={props.state.result}
          selectedActionCount={props.state.selectedActionCount}
          notAppliedActionCount={props.state.notAppliedActionCount}
          taskLinks={props.state.taskLinks}
          todayHref={props.todayHref}
          calendarHref={props.calendarHref}
          onEditInput={props.onEditInput}
        />
      ) : (
        <PlannerTerminalProposalState
          proposal={props.state.proposal}
          todayHref={props.todayHref}
          calendarHref={props.calendarHref}
          onEditInput={props.onEditInput}
        />
      )}
    </div>
  );
}
