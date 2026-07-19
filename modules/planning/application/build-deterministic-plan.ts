import { ianaTimeZoneSchema } from "@/shared/validation/time-zone";

import { scheduleDeterministically } from "../domain/scheduler/deterministic-scheduler";
import type { RawSchedulingCandidate } from "../domain/scheduler/scheduler-model";
import type { SchedulingCandidate, SchedulingInput, SchedulingResult } from "./scheduling-contract";

export function buildDeterministicPlan(input: SchedulingInput): SchedulingResult {
  if (!ianaTimeZoneSchema.safeParse(input.timeZone).success) {
    return {
      placed: [],
      overflow: [],
      conflicts: [{ semanticRef: null, code: "INVALID_TIME_ZONE" }],
    };
  }

  return scheduleDeterministically({
    timeZone: input.timeZone,
    workWindows: input.workWindows.map((window) => ({ ...window })),
    busyIntervals: input.busyIntervals.map((interval) => ({ ...interval })),
    bufferMinutes: input.bufferMinutes,
    candidates: input.candidates.map(mapCandidate),
  });
}

function mapCandidate(candidate: SchedulingCandidate): RawSchedulingCandidate {
  if (candidate.kind === "fixed") {
    return { ...candidate };
  }

  return { ...candidate };
}
