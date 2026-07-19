import type {
  PlannerApplyResult,
  PlannerCapability,
  PlannerInput,
  PlannerProposalDto,
  PlannerSelection,
} from "../application/contracts";

export type PlannerTaskOption = Readonly<{
  id: string;
  title: string;
  priority: "none" | "low" | "medium" | "high";
}>;

export type PlannerFailureKind =
  | "refusal"
  | "timeout"
  | "invalid_schema"
  | "provider"
  | "constraint"
  | "input_stale"
  | "stale"
  | "apply"
  | "apply_unknown"
  | "reject_unknown"
  | "refresh"
  | "permission";

export type PlannerFailure = Readonly<{
  kind: PlannerFailureKind;
}>;

export type PlannerActionIssue = Readonly<{
  actionId?: string | undefined;
  semanticRef?: string | undefined;
  kind: "stale" | "invalid" | "conflict";
  message: string;
  latestBefore?: string | undefined;
}>;

export type PlannerScreenState =
  | Readonly<{ kind: "describe"; failure?: PlannerFailure | undefined }>
  | Readonly<{
      kind: "processing";
      stage: "interpreting" | "validating" | "scheduling";
      submittedInput: PlannerInput;
    }>
  | Readonly<{
      kind: "review";
      proposal: PlannerProposalDto;
      operation?: "idle" | "applying" | "rejecting" | "revalidating" | undefined;
      issues?: readonly PlannerActionIssue[] | undefined;
      failure?: PlannerFailure | undefined;
    }>
  | Readonly<{
      kind: "result";
      proposal: PlannerProposalDto;
      result: PlannerApplyResult;
      selectedActionCount: number;
      notAppliedActionCount: number;
    }>
  | Readonly<{ kind: "permission" }>;

export type AssistantPlannerScreenProps = Readonly<{
  capability: PlannerCapability;
  initialInput: PlannerInput;
  tasks: readonly PlannerTaskOption[];
  state: PlannerScreenState;
  online: boolean;
  todayHref: string;
  calendarHref: string;
  onCreateProposal: (input: PlannerInput) => void;
  onApply: (selection: PlannerSelection) => void;
  onReject: (proposalId: string) => void;
  onRetry: () => void;
  onEditInput: () => void;
}>;
