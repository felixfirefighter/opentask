import {
  markCandidateReferenceConflicts,
  markFixedConflicts,
  parseFixedCandidates,
  parseFlexibleCandidates,
} from "./candidate-policy";
import { freeIntervals, sortIntervals, workWindowsOverlap } from "./free-interval-policy";
import type {
  DomainSchedulingResult,
  IndexedFlexibleCandidate,
  IndexedPlacement,
  InstantInterval,
  RawSchedulingInput,
  SchedulingConflict,
  SchedulingOverflow,
} from "./scheduler-model";
import {
  formatInstant,
  minutesToNanoseconds,
  parseInstantInterval,
  parseWorkWindow,
} from "./temporal-interval";

export function scheduleDeterministically(input: RawSchedulingInput): DomainSchedulingResult {
  const conflicts: SchedulingConflict[] = [];
  const buffer = minutesToNanoseconds(input.bufferMinutes);

  if (buffer === null) {
    return resultWithGlobalConflict("INVALID_CONSTRAINT");
  }

  const workWindows = parseWorkWindows(input, conflicts);
  const busyIntervals = parseBusyIntervals(input, conflicts);

  if (conflicts.length > 0) {
    return { placed: [], overflow: [], conflicts };
  }

  const candidateConflicts = new Map<number, SchedulingConflict>();
  markCandidateReferenceConflicts(input, candidateConflicts);

  const fixedCandidates = parseFixedCandidates(input, workWindows, candidateConflicts);
  markFixedConflicts(fixedCandidates, busyIntervals, buffer, candidateConflicts);

  const acceptedFixed = fixedCandidates.filter((candidate) => !candidateConflicts.has(candidate.index));
  const flexibleCandidates = parseFlexibleCandidates(input, workWindows, candidateConflicts);
  const occupied = sortIntervals([...busyIntervals, ...acceptedFixed.map((candidate) => candidate.interval)]);
  const placements: IndexedPlacement[] = acceptedFixed.map((candidate) => ({ ...candidate }));
  const overflow: SchedulingOverflow[] = [];

  for (const candidate of [...flexibleCandidates].sort(compareAllocationPriority)) {
    if (candidateConflicts.has(candidate.index)) {
      continue;
    }

    const placement = findPlacement(candidate, workWindows, occupied, buffer);

    if (placement === null) {
      overflow.push({
        semanticRef: candidate.semanticRef,
        reason: candidate.deadline === null ? "NO_FREE_INTERVAL" : "DEADLINE_BLOCKED",
      });
      continue;
    }

    placements.push({
      index: candidate.index,
      semanticRef: candidate.semanticRef,
      interval: placement,
    });
    occupied.push(placement);
    occupied.sort(compareIntervals);
  }

  return {
    placed: placements
      .sort((left, right) => left.index - right.index)
      .map((placement) => ({
        semanticRef: placement.semanticRef,
        startAt: formatInstant(placement.interval.start),
        endAt: formatInstant(placement.interval.end),
      })),
    overflow,
    conflicts: [...candidateConflicts.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, conflict]) => conflict),
  };
}

function parseWorkWindows(input: RawSchedulingInput, conflicts: SchedulingConflict[]): InstantInterval[] {
  if (input.workWindows.length === 0) {
    conflicts.push({ semanticRef: null, code: "INVALID_WORK_WINDOW" });
    return [];
  }

  const windows: InstantInterval[] = [];

  for (const window of input.workWindows) {
    const parsed = parseWorkWindow(input.timeZone, window);

    if (parsed === null) {
      conflicts.push({ semanticRef: null, code: "INVALID_WORK_WINDOW" });
    } else {
      windows.push(parsed);
    }
  }

  if (conflicts.length === 0 && workWindowsOverlap(windows)) {
    conflicts.push({ semanticRef: null, code: "OVERLAPPING_WORK_WINDOWS" });
  }

  return sortIntervals(windows);
}

function parseBusyIntervals(input: RawSchedulingInput, conflicts: SchedulingConflict[]): InstantInterval[] {
  const intervals: InstantInterval[] = [];

  for (const busy of input.busyIntervals) {
    const parsed = parseInstantInterval(busy.startAt, busy.endAt);

    if (parsed === null) {
      conflicts.push({ semanticRef: busy.semanticRef ?? null, code: "INVALID_BUSY_INTERVAL" });
    } else {
      intervals.push(parsed);
    }
  }

  return sortIntervals(intervals);
}

function findPlacement(
  candidate: IndexedFlexibleCandidate,
  workWindows: readonly InstantInterval[],
  occupied: readonly InstantInterval[],
  buffer: bigint,
): InstantInterval | null {
  for (const window of workWindows) {
    for (const free of freeIntervals(window, occupied, buffer)) {
      const start =
        candidate.earliestStart !== null && candidate.earliestStart > free.start
          ? candidate.earliestStart
          : free.start;
      const limit =
        candidate.deadline !== null && candidate.deadline < free.end ? candidate.deadline : free.end;
      const end = start + candidate.duration;

      if (end <= limit) {
        return { start, end };
      }
    }
  }

  return null;
}

function compareIntervals(left: InstantInterval, right: InstantInterval): number {
  if (left.start === right.start) {
    return left.end === right.end ? 0 : left.end < right.end ? -1 : 1;
  }

  return left.start < right.start ? -1 : 1;
}

function compareAllocationPriority(left: IndexedFlexibleCandidate, right: IndexedFlexibleCandidate): number {
  // Earliest deadlines win; equal deadlines retain caller order and unconstrained work is last.
  if (left.deadline === null && right.deadline !== null) {
    return 1;
  }

  if (left.deadline !== null && right.deadline === null) {
    return -1;
  }

  if (left.deadline !== null && right.deadline !== null && left.deadline !== right.deadline) {
    return left.deadline < right.deadline ? -1 : 1;
  }

  return left.index - right.index;
}

function resultWithGlobalConflict(code: SchedulingConflict["code"]): DomainSchedulingResult {
  return {
    placed: [],
    overflow: [],
    conflicts: [{ semanticRef: null, code }],
  };
}
