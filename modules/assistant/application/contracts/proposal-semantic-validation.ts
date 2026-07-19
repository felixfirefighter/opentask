import { z } from "zod";

import type { PlannerAction } from "./proposal-contract";
import type { PlannerProposalSubject } from "./proposal-subject-contract";

type ProposalSemanticInput = Readonly<{
  subjects: readonly PlannerProposalSubject[];
  actions: readonly PlannerAction[];
  overflow: ReadonlyArray<{ semanticRef: string }>;
  conflicts: ReadonlyArray<{ semanticRef: string | null }>;
}>;

export function validateProposalSemantics(
  proposal: ProposalSemanticInput,
  context: z.core.$RefinementCtx<ProposalSemanticInput>,
): void {
  const subjectsByReference = new Map(proposal.subjects.map((subject) => [subject.semanticRef, subject]));
  const selectedReferenceToTask = new Map<string, string>();
  const selectedTaskToReference = new Map<string, string>();
  const referencedSubjects = new Set<string>();

  for (const action of proposal.actions) {
    referencedSubjects.add(action.semanticRef);
    const subject = subjectsByReference.get(action.semanticRef);
    if (!subject) {
      addIssue(context, ["actions"], "Every planner action must resolve to a proposal subject.");
      continue;
    }

    const taskId = action.kind === "create" ? null : action.taskId;
    if (taskId !== subject.taskId) {
      addIssue(context, ["actions"], "Planner action task IDs must match their proposal subject.");
    }
    if (action.kind === "create" && action.after.title !== subject.title) {
      addIssue(context, ["actions"], "Created task titles must match their proposal subject.");
    }
    if (action.kind === "update" && action.before.title !== subject.title) {
      addIssue(context, ["actions"], "Updated task subjects must preserve the current title.");
    }

    if (action.semanticRef.startsWith("selected-") && taskId !== null) {
      recordSelectedMapping(
        action.semanticRef,
        taskId,
        selectedReferenceToTask,
        selectedTaskToReference,
        context,
      );
    }
  }

  for (const item of proposal.overflow) {
    referencedSubjects.add(item.semanticRef);
    if (!subjectsByReference.has(item.semanticRef)) {
      addIssue(context, ["overflow"], "Every overflow item must resolve to a proposal subject.");
    }
  }

  for (const conflict of proposal.conflicts) {
    if (conflict.semanticRef === null) continue;
    referencedSubjects.add(conflict.semanticRef);
    if (!subjectsByReference.has(conflict.semanticRef)) {
      addIssue(context, ["conflicts"], "Every referenced conflict must resolve to a proposal subject.");
    }
  }

  if (proposal.subjects.some(({ semanticRef }) => !referencedSubjects.has(semanticRef))) {
    addIssue(context, ["subjects"], "Proposal subjects must be used by an action, overflow, or conflict.");
  }
}

function recordSelectedMapping(
  semanticRef: string,
  taskId: string,
  referenceToTask: Map<string, string>,
  taskToReference: Map<string, string>,
  context: z.core.$RefinementCtx<ProposalSemanticInput>,
): void {
  const mappedTask = referenceToTask.get(semanticRef);
  const mappedReference = taskToReference.get(taskId);
  if (mappedTask !== undefined && mappedTask !== taskId) {
    addIssue(context, ["actions"], "One selected reference cannot target multiple tasks.");
  }
  if (mappedReference !== undefined && mappedReference !== semanticRef) {
    addIssue(context, ["actions"], "One selected task cannot use multiple semantic references.");
  }
  referenceToTask.set(semanticRef, taskId);
  taskToReference.set(taskId, semanticRef);
}

function addIssue(
  context: z.core.$RefinementCtx<ProposalSemanticInput>,
  path: PropertyKey[],
  message: string,
): void {
  context.addIssue({ code: "custom", path, message });
}
