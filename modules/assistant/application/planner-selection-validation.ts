import { z } from "zod";

import { ApplicationError } from "@/shared/http/application-error";

import {
  plannerScheduleSchema,
  type PlannerAction,
  type PlannerProposalDto,
  type PlannerSelection,
} from "./contracts";
import { plannerSelectedTaskSnapshotSchema } from "./contracts/proposal-creation-contract";
import type { PlannerApplyTaskSnapshot } from "./contracts/planner-apply-unit-of-work";

const plannerApplyTaskSnapshotSchema = z.strictObject({
  ...plannerSelectedTaskSnapshotSchema.shape,
  schedule: plannerScheduleSchema.nullable(),
});

export function validatePlannerSelection(proposal: PlannerProposalDto, selection: PlannerSelection): void {
  const originalById = new Map(proposal.proposal.actions.map((action) => [action.actionId, action]));

  for (const selected of selection.actions) {
    const original = originalById.get(selected.actionId);
    if (!original) {
      throw invalidSelection("A selected planner action does not belong to this proposal.");
    }
    assertAllowedReviewEdit(original, selected);
  }
}

export function validateCurrentPlannerTasks(
  proposal: PlannerProposalDto,
  selectedActions: readonly PlannerAction[],
  rawSnapshots: readonly PlannerApplyTaskSnapshot[],
): readonly PlannerApplyTaskSnapshot[] {
  const selectedTaskIds = taskIdsForActions(selectedActions);
  if (selectedTaskIds.length === 0) return [];

  const parsed = plannerApplyTaskSnapshotSchema.array().max(100).safeParse(rawSnapshots);
  if (!parsed.success) {
    throw new ApplicationError("INTERNAL", "Current planner task state could not be read safely.");
  }

  const snapshotsById = new Map(parsed.data.map((snapshot) => [snapshot.id, snapshot]));
  const selectedTaskIdSet = new Set(selectedTaskIds);
  if (snapshotsById.size !== parsed.data.length || parsed.data.some(({ id }) => !selectedTaskIdSet.has(id))) {
    throw new ApplicationError("INTERNAL", "Current planner task state could not be read safely.");
  }
  if (selectedTaskIds.some((id) => !snapshotsById.has(id))) {
    throw new ApplicationError("NOT_FOUND", "A task selected by this proposal is no longer available.");
  }

  for (const taskId of selectedTaskIds) {
    const snapshot = snapshotsById.get(taskId);
    if (!snapshot) {
      throw new ApplicationError("NOT_FOUND", "A task selected by this proposal is no longer available.");
    }
    const expectedVersion = proposal.contextVersions[taskId];
    if (expectedVersion === undefined) {
      throw new ApplicationError("INTERNAL", "The planner proposal is missing a task version.");
    }
    if (snapshot.version !== expectedVersion) {
      throw new ApplicationError("CONFLICT", "A task changed after this proposal was created.", {
        currentVersion: snapshot.version,
      });
    }
  }

  assertActionBeforeValues(selectedActions, snapshotsById);
  return selectedTaskIds.map((id) => snapshotsById.get(id) as PlannerApplyTaskSnapshot);
}

export function taskIdsForActions(actions: readonly PlannerAction[]): readonly string[] {
  return [
    ...new Set(
      actions.flatMap((action) => ("taskId" in action && action.taskId !== null ? [action.taskId] : [])),
    ),
  ].sort();
}

function assertAllowedReviewEdit(original: PlannerAction, selected: PlannerAction): void {
  if (
    original.kind !== selected.kind ||
    original.semanticRef !== selected.semanticRef ||
    !sameJson(original.rationale, selected.rationale) ||
    !sameJson(original.uncertainties, selected.uncertainties)
  ) {
    throw invalidSelection("Only the editable after-values of a planner action can be changed.");
  }

  if (original.kind === "create" && selected.kind === "create") return;
  if (original.kind === "update" && selected.kind === "update") {
    assertExistingTargetAndBefore(original, selected, original.before, selected.before);
    return;
  }
  if (original.kind === "prioritize" && selected.kind === "prioritize") {
    assertExistingTargetAndBefore(original, selected, original.before, selected.before);
    return;
  }
  if (original.kind === "schedule" && selected.kind === "schedule") {
    assertExistingTargetAndBefore(original, selected, original.before, selected.before);
    return;
  }
  if (original.kind === "defer" && selected.kind === "defer" && sameJson(original, selected)) return;

  throw invalidSelection("The selected planner action changed an immutable field.");
}

function assertExistingTargetAndBefore(
  original: Extract<PlannerAction, { kind: "update" | "prioritize" | "schedule" }>,
  selected: Extract<PlannerAction, { kind: "update" | "prioritize" | "schedule" }>,
  originalBefore: unknown,
  selectedBefore: unknown,
): void {
  if (original.taskId !== selected.taskId || !sameJson(originalBefore, selectedBefore)) {
    throw invalidSelection("A planner action target or before-value cannot be changed during review.");
  }
}

function assertActionBeforeValues(
  actions: readonly PlannerAction[],
  snapshotsById: ReadonlyMap<string, PlannerApplyTaskSnapshot>,
): void {
  for (const action of actions) {
    if (action.kind === "create" || action.kind === "defer") continue;
    const snapshot = snapshotsById.get(action.taskId);
    if (!snapshot) {
      throw new ApplicationError("NOT_FOUND", "A task selected by this proposal is no longer available.");
    }

    const matches =
      action.kind === "update"
        ? sameJson(action.before, {
            title: snapshot.title,
            descriptionMd: snapshot.descriptionMd,
          })
        : action.kind === "prioritize"
          ? action.before === snapshot.priority
          : sameJson(action.before, snapshot.schedule);
    if (!matches) {
      throw new ApplicationError("CONFLICT", "A task changed after this proposal was created.", {
        currentVersion: snapshot.version,
      });
    }
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function invalidSelection(message: string): ApplicationError {
  return new ApplicationError("VALIDATION_FAILED", message);
}
