import { buildDeterministicPlan, type BusyInterval, type FixedSchedulingCandidate } from "@/modules/planning";
import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { DatabaseTransaction } from "@/shared/db/client";
import { ApplicationError } from "@/shared/http/application-error";

import {
  plannerScheduleSchema,
  type PlannerAction,
  type PlannerProposalDto,
  type PlannerSchedule,
} from "./contracts";
import type { PlannerApplyTaskWriter } from "./contracts/planner-apply-unit-of-work";
import { resolvePlannerWorkWindow } from "./planner-local-time";

type DeterministicScheduler = typeof buildDeterministicPlan;

export async function validatePlannerApplySchedules(options: {
  actor: AuthenticatedActor;
  proposal: PlannerProposalDto;
  actions: readonly PlannerAction[];
  tasks: PlannerApplyTaskWriter;
  transaction: DatabaseTransaction;
  schedule: DeterministicScheduler;
}): Promise<void> {
  const candidates = fixedCandidates(options.actions, options.proposal.proposal.planningContext.timeZone);
  if (candidates.length === 0) return;

  const context = options.proposal.proposal.planningContext;
  const window = resolvePlannerWorkWindow({
    planningDate: options.proposal.planningDate,
    timeZone: context.timeZone,
    workWindow: context.workWindow,
  });
  if (!window) {
    throw invalidPlan("The proposal work window is not valid on this planning date.");
  }

  const excludedTaskIds = options.actions.flatMap((action) =>
    action.kind === "schedule" ? [action.taskId] : [],
  );
  const page = await options.tasks.loadBusySchedulesForUpdate(
    options.actor,
    {
      rangeStartDate: options.proposal.planningDate,
      rangeEndDate: window.nextLocalDate,
      rangeStartAt: window.startAt,
      rangeEndAt: window.endAt,
      limit: 500,
    },
    [...new Set(excludedTaskIds)].sort(),
    options.transaction,
  );
  if (page.truncated) {
    throw invalidPlan("The planning window has too many scheduled items to validate safely.");
  }

  const busyIntervals = parseBusyIntervals(page.items);
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
    candidates,
  });
  const placedReferences = new Set(result.placed.map(({ semanticRef }) => semanticRef));
  if (
    result.conflicts.length > 0 ||
    result.overflow.length > 0 ||
    result.placed.length !== candidates.length ||
    candidates.some(({ semanticRef }) => !placedReferences.has(semanticRef))
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

function parseBusyIntervals(
  items: readonly Readonly<{ schedule: PlannerSchedule }>[],
): readonly BusyInterval[] {
  if (items.length > 500) {
    throw new ApplicationError("INTERNAL", "Current planner schedule state could not be read safely.");
  }
  const parsed = items.map(({ schedule }) => plannerScheduleSchema.safeParse(schedule));
  if (parsed.some((result) => !result.success)) {
    throw new ApplicationError("INTERNAL", "Current planner schedule state could not be read safely.");
  }
  return parsed.flatMap((result) =>
    result.success && result.data.kind === "timed"
      ? [{ startAt: result.data.startAt, endAt: result.data.endAt }]
      : [],
  );
}

function invalidPlan(message: string): ApplicationError {
  return new ApplicationError("VALIDATION_FAILED", message);
}

export const defaultPlannerApplyScheduler: DeterministicScheduler = buildDeterministicPlan;
