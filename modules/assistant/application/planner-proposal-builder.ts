import type { SchedulingCandidate, SchedulingResult } from "@/modules/planning";

import {
  PLANNER_SCHEMA_VERSION,
  plannerProposalSchema,
  type ModelExtraction,
  type PlannerAction,
  type PlannerInput,
  type PlannerProposal,
  type PlannerProposalSubject,
  type ProposalContextVersions,
} from "./contracts";
import type { PlannerSelectedTaskSnapshot } from "./contracts/proposal-creation-contract";
import { optionalLocalDateTimeToInstant } from "./planner-local-time";

export type PlannerProposalBuildResult = Readonly<{
  proposal: PlannerProposal;
  contextVersions: ProposalContextVersions;
}>;

export function buildSchedulingCandidates(
  extraction: ModelExtraction,
  timeZone: string,
): readonly SchedulingCandidate[] {
  return extraction.tasks.map((task) => {
    if (task.timing.kind === "fixed") {
      return {
        kind: "fixed",
        semanticRef: task.source.semanticRef,
        startAt: optionalLocalDateTimeToInstant(task.timing.start, timeZone) ?? "invalid-local-date-time",
        endAt: optionalLocalDateTimeToInstant(task.timing.end, timeZone) ?? "invalid-local-date-time",
      };
    }

    const earliestStartAt = optionalLocalDateTimeToInstant(task.timing.earliestStart, timeZone);
    const deadlineAt = optionalLocalDateTimeToInstant(task.timing.deadline, timeZone);
    return {
      kind: "flexible",
      semanticRef: task.source.semanticRef,
      durationMinutes: task.estimateMinutes,
      ...(earliestStartAt === undefined ? {} : { earliestStartAt }),
      ...(deadlineAt === undefined ? {} : { deadlineAt }),
    };
  });
}

export function buildPlannerProposal(options: {
  input: PlannerInput;
  extraction: ModelExtraction;
  selectedTasksByReference: ReadonlyMap<string, PlannerSelectedTaskSnapshot>;
  scheduling: SchedulingResult;
  createActionId: () => string;
}): PlannerProposalBuildResult {
  const placedByReference = new Map(options.scheduling.placed.map((block) => [block.semanticRef, block]));
  const overflowReferences = new Set(options.scheduling.overflow.map(({ semanticRef }) => semanticRef));
  const conflictedReferences = new Set(
    options.scheduling.conflicts.flatMap(({ semanticRef }) => (semanticRef === null ? [] : [semanticRef])),
  );
  const subjects: PlannerProposalSubject[] = [];
  const actions: PlannerAction[] = [];

  for (const extracted of options.extraction.tasks) {
    const semanticRef = extracted.source.semanticRef;
    const selected = options.selectedTasksByReference.get(semanticRef);
    const placed = placedByReference.get(semanticRef);
    const isReported =
      placed !== undefined || overflowReferences.has(semanticRef) || conflictedReferences.has(semanticRef);
    if (!isReported) continue;

    subjects.push(
      selected
        ? {
            semanticRef: semanticRef as `selected-${number}`,
            title: selected.title,
            source: "selected_task",
            taskId: selected.id,
          }
        : {
            semanticRef: semanticRef as `new-${number}`,
            title: extracted.title,
            source: "brain_dump",
            taskId: null,
          },
    );

    if (overflowReferences.has(semanticRef) || conflictedReferences.has(semanticRef)) {
      actions.push({
        actionId: options.createActionId(),
        kind: "defer",
        semanticRef,
        taskId: selected?.id ?? null,
        rationale: extracted.rationale,
        uncertainties: extracted.uncertainties,
      });
      continue;
    }
    if (!placed) continue;

    const schedule = {
      kind: "timed" as const,
      startAt: placed.startAt,
      endAt: placed.endAt,
      timeZone: options.input.timeZone,
    };
    if (!selected) {
      actions.push({
        actionId: options.createActionId(),
        kind: "create",
        semanticRef: semanticRef as `new-${number}`,
        after: {
          title: extracted.title,
          descriptionMd: extracted.detail ?? "",
          priority: extracted.priority,
          schedule,
        },
        rationale: extracted.rationale,
        uncertainties: extracted.uncertainties,
      });
      continue;
    }

    const updatedDescription = extracted.detail ?? selected.descriptionMd;
    if (extracted.title !== selected.title || updatedDescription !== selected.descriptionMd) {
      actions.push({
        actionId: options.createActionId(),
        kind: "update",
        semanticRef: semanticRef as `selected-${number}`,
        taskId: selected.id,
        before: { title: selected.title, descriptionMd: selected.descriptionMd },
        after: { title: extracted.title, descriptionMd: updatedDescription },
        rationale: extracted.rationale,
        uncertainties: extracted.uncertainties,
      });
    }
    if (extracted.priority !== selected.priority) {
      actions.push({
        actionId: options.createActionId(),
        kind: "prioritize",
        semanticRef: semanticRef as `selected-${number}`,
        taskId: selected.id,
        before: selected.priority,
        after: extracted.priority,
        rationale: extracted.rationale,
        uncertainties: extracted.uncertainties,
      });
    }
    actions.push({
      actionId: options.createActionId(),
      kind: "schedule",
      semanticRef: semanticRef as `selected-${number}`,
      taskId: selected.id,
      before: null,
      after: schedule,
      rationale: extracted.rationale,
      uncertainties: extracted.uncertainties,
    });
  }

  const usedTaskIds = new Set(subjects.flatMap(({ taskId }) => (taskId === null ? [] : [taskId])));
  const contextVersions = Object.fromEntries(
    [...options.selectedTasksByReference.values()]
      .filter(({ id }) => usedTaskIds.has(id))
      .map(({ id, version }) => [id, version]),
  );

  const proposal = plannerProposalSchema.parse({
    schemaVersion: PLANNER_SCHEMA_VERSION,
    planningDate: options.input.planningDate,
    planningContext: {
      timeZone: options.input.timeZone,
      workWindow: options.input.workWindow,
      defaultDurationMinutes: options.input.defaultDurationMinutes,
      bufferMinutes: options.input.bufferMinutes,
    },
    summary: options.extraction.summary,
    subjects,
    actions,
    overflow: options.scheduling.overflow,
    conflicts: options.scheduling.conflicts,
    uncertainties: options.extraction.uncertainties,
  });
  return { proposal, contextVersions };
}
