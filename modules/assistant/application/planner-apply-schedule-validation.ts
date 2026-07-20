import { z } from "zod";

import {
  PLANNING_PROJECTION_MAX_ROWS,
  buildDeterministicPlan,
  type BusyInterval,
  type FixedSchedulingCandidate,
  type PlanningBusyIntervalPage,
} from "@/modules/planning";
import { ApplicationError } from "@/shared/http/application-error";

import { type PlannerAction, type PlannerProposalDto, type PlannerSchedule } from "./contracts";
import { instantSchema } from "./contracts/contract-primitives";
import type { PlannerApplyBusyIntervalRequest } from "./contracts/planner-apply-unit-of-work";
import { resolvePlannerWorkWindow } from "./planner-local-time";

type DeterministicScheduler = typeof buildDeterministicPlan;
const plannerBusyIntervalSchema = z
  .strictObject({ startAt: instantSchema, endAt: instantSchema })
  .refine(({ startAt, endAt }) => Date.parse(endAt) >= Date.parse(startAt), {
    message: "A busy interval cannot end before it starts.",
  });

export type PreparedPlannerApplyScheduleValidation = Readonly<{
  busyRequest: PlannerApplyBusyIntervalRequest;
  candidates: readonly FixedSchedulingCandidate[];
}>;

export function preparePlannerApplyScheduleValidation(
  proposal: PlannerProposalDto,
  actions: readonly PlannerAction[],
): PreparedPlannerApplyScheduleValidation | null {
  const candidates = fixedCandidates(actions, proposal.proposal.planningContext.timeZone);
  if (candidates.length === 0) return null;

  const context = proposal.proposal.planningContext;
  const window = resolvePlannerWorkWindow({
    planningDate: proposal.planningDate,
    timeZone: context.timeZone,
    workWindow: context.workWindow,
  });
  if (!window) {
    throw invalidPlan("The proposal work window is not valid on this planning date.");
  }

  const excludedTaskIds = actions.flatMap((action) => (action.kind === "schedule" ? [action.taskId] : []));
  return {
    candidates,
    busyRequest: {
      query: {
        rangeStartDate: proposal.planningDate,
        rangeEndDate: window.nextLocalDate,
        rangeStartAt: window.startAt,
        rangeEndAt: window.endAt,
        limit: PLANNING_PROJECTION_MAX_ROWS,
      },
      excludedTaskIds: [...new Set(excludedTaskIds)].sort(),
    },
  };
}

export function validatePlannerApplySchedules(options: {
  proposal: PlannerProposalDto;
  prepared: PreparedPlannerApplyScheduleValidation | null;
  busyIntervals: PlanningBusyIntervalPage | null;
  schedule: DeterministicScheduler;
}): void {
  if (!options.prepared) return;
  if (!options.busyIntervals) {
    throw new ApplicationError("INTERNAL", "Current planner occurrence state was not loaded safely.");
  }
  if (options.busyIntervals.truncation.truncated) {
    throw invalidPlan(
      "The recurring occurrence context was truncated by a safety limit, so the proposal cannot be applied safely.",
    );
  }

  const context = options.proposal.proposal.planningContext;
  const busyIntervals = parseBusyIntervals(options.busyIntervals.items);
  const result = options.schedule({
    timeZone: context.timeZone,
    workWindows: [
      {
        localDate: options.proposal.planningDate,
        startTime: context.workWindow.start,
        endTime: context.workWindow.end,
      },
    ],
    busyIntervals,
    bufferMinutes: context.bufferMinutes,
    candidates: options.prepared.candidates,
  });
  const placedReferences = new Set(result.placed.map(({ semanticRef }) => semanticRef));
  if (
    result.conflicts.length > 0 ||
    result.overflow.length > 0 ||
    result.placed.length !== options.prepared.candidates.length ||
    options.prepared.candidates.some(({ semanticRef }) => !placedReferences.has(semanticRef))
  ) {
    throw new ApplicationError(
      "CONFLICT",
      "The reviewed schedule no longer fits the proposal work window and current calendar.",
    );
  }
}

function fixedCandidates(
  actions: readonly PlannerAction[],
  planningTimeZone: string,
): readonly FixedSchedulingCandidate[] {
  return actions.flatMap((action) => {
    const schedule = scheduleAfter(action);
    if (!schedule) return [];
    if (schedule.kind !== "timed") {
      throw invalidPlan("Planner schedule changes must be timed blocks inside the work window.");
    }
    if (schedule.timeZone !== planningTimeZone) {
      throw invalidPlan("Planner schedule changes must use the proposal timezone.");
    }
    return [
      {
        kind: "fixed" as const,
        semanticRef: action.semanticRef,
        startAt: schedule.startAt,
        endAt: schedule.endAt,
      },
    ];
  });
}

function scheduleAfter(action: PlannerAction): PlannerSchedule | null {
  if (action.kind === "schedule") return action.after;
  if (action.kind === "create") return action.after.schedule;
  return null;
}

function parseBusyIntervals(items: readonly BusyInterval[]): readonly BusyInterval[] {
  if (items.length > PLANNING_PROJECTION_MAX_ROWS) {
    throw new ApplicationError("INTERNAL", "Current planner schedule state could not be read safely.");
  }
  const parsed = items.map((interval) => plannerBusyIntervalSchema.safeParse(interval));
  if (parsed.some((result) => !result.success)) {
    throw new ApplicationError("INTERNAL", "Current planner schedule state could not be read safely.");
  }
  return parsed.flatMap((result) => (result.success ? [result.data] : []));
}

function invalidPlan(message: string): ApplicationError {
  return new ApplicationError("VALIDATION_FAILED", message);
}

export const defaultPlannerApplyScheduler: DeterministicScheduler = buildDeterministicPlan;
