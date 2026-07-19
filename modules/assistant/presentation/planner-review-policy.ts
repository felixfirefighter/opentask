import type { PlannerAction, PlannerProposal } from "../application/contracts";
import type { PlannerActionIssue } from "./planner-screen-model";

export type ReviewGroupId = "attention" | "changed" | "created" | "deferred";

export function issuesForAction(
  action: PlannerAction,
  proposal: PlannerProposal,
  externalIssues: readonly PlannerActionIssue[],
): readonly PlannerActionIssue[] {
  const matched = externalIssues.filter(
    (issue) =>
      (issue.actionId === undefined && issue.semanticRef === undefined) ||
      issue.actionId === action.actionId ||
      issue.semanticRef === action.semanticRef,
  );
  const conflicts = proposal.conflicts
    .filter(({ semanticRef }) => semanticRef === null || semanticRef === action.semanticRef)
    .map(({ code }): PlannerActionIssue => ({
      actionId: action.actionId,
      kind: "conflict",
      message: conflictMessage(code),
    }));
  return [...matched, ...conflicts];
}

export function overflowMessage(action: PlannerAction, proposal: PlannerProposal): string | null {
  const overflow = proposal.overflow.find(({ semanticRef }) => semanticRef === action.semanticRef);
  if (!overflow) return null;
  return overflow.reason === "DEADLINE_BLOCKED"
    ? "This item could not fit before its deadline."
    : "No free interval was available inside the work window.";
}

export function groupForAction(
  action: PlannerAction,
  proposal: PlannerProposal,
  issues: readonly PlannerActionIssue[],
): ReviewGroupId {
  if (issues.length > 0 || action.uncertainties.length > 0) return "attention";
  if (action.kind === "create") return "created";
  if (action.kind === "defer" || overflowMessage(action, proposal)) return "deferred";
  return "changed";
}

export function targetTitle(action: PlannerAction, proposal: PlannerProposal): string {
  if (action.kind === "create") return action.after.title;
  return (
    proposal.subjects.find(({ semanticRef }) => semanticRef === action.semanticRef)?.title ??
    "Unavailable task"
  );
}

export function isActionEditable(action: PlannerAction): boolean {
  return action.kind !== "defer";
}

function conflictMessage(code: PlannerProposal["conflicts"][number]["code"]): string {
  const messages: Record<typeof code, string> = {
    INVALID_TIME_ZONE: "The timezone could not be used safely.",
    INVALID_WORK_WINDOW: "The selected work window is invalid.",
    OVERLAPPING_WORK_WINDOWS: "The available work windows overlap.",
    INVALID_BUSY_INTERVAL: "An existing calendar interval is invalid.",
    INVALID_SEMANTIC_REF: "This suggestion no longer maps to a known item.",
    DUPLICATE_SEMANTIC_REF: "This item was suggested more than once.",
    INVALID_DURATION: "The estimated duration is invalid.",
    INVALID_CONSTRAINT: "A planning constraint could not be validated.",
    IMPOSSIBLE_CONSTRAINTS: "The requested constraints cannot all be satisfied.",
    FIXED_OUTSIDE_WORK_WINDOW: "The fixed time falls outside the work window.",
    FIXED_OVERLAP: "The fixed time overlaps another item.",
    FIXED_BUFFER_CONFLICT: "The fixed time does not leave the requested buffer.",
  };
  return messages[code];
}
