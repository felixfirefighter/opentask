import { intervalGap, intervalIsContained, intervalsOverlap } from "./free-interval-policy";
import type {
  IndexedFixedCandidate,
  IndexedFlexibleCandidate,
  InstantInterval,
  RawSchedulingInput,
  SchedulingConflict,
} from "./scheduler-model";
import { minutesToNanoseconds, parseInstant, parseInstantInterval } from "./temporal-interval";

export function markCandidateReferenceConflicts(
  input: RawSchedulingInput,
  conflicts: Map<number, SchedulingConflict>,
): void {
  const duplicateRefs = findDuplicateReferences(input);

  input.candidates.forEach((candidate, index) => {
    if (candidate.semanticRef.trim().length === 0) {
      conflicts.set(index, { semanticRef: null, code: "INVALID_SEMANTIC_REF" });
      return;
    }

    if (duplicateRefs.has(candidate.semanticRef)) {
      conflicts.set(index, {
        semanticRef: candidate.semanticRef,
        code: "DUPLICATE_SEMANTIC_REF",
      });
    }
  });
}

export function parseFixedCandidates(
  input: RawSchedulingInput,
  workWindows: readonly InstantInterval[],
  conflicts: Map<number, SchedulingConflict>,
): IndexedFixedCandidate[] {
  const fixed: IndexedFixedCandidate[] = [];

  input.candidates.forEach((candidate, index) => {
    if (candidate.kind !== "fixed" || conflicts.has(index)) {
      return;
    }

    const interval = parseInstantInterval(candidate.startAt, candidate.endAt);

    if (interval === null) {
      conflicts.set(index, { semanticRef: candidate.semanticRef, code: "INVALID_CONSTRAINT" });
      return;
    }

    if (!intervalIsContained(interval, workWindows)) {
      conflicts.set(index, {
        semanticRef: candidate.semanticRef,
        code: "FIXED_OUTSIDE_WORK_WINDOW",
      });
      return;
    }

    fixed.push({ index, semanticRef: candidate.semanticRef, interval });
  });

  return fixed;
}

export function markFixedConflicts(
  fixed: readonly IndexedFixedCandidate[],
  busyIntervals: readonly InstantInterval[],
  buffer: bigint,
  conflicts: Map<number, SchedulingConflict>,
): void {
  for (const candidate of fixed) {
    const overlap = busyIntervals.some((busy) => intervalsOverlap(candidate.interval, busy));
    const bufferConflict = busyIntervals.some(
      (busy) => !intervalsOverlap(candidate.interval, busy) && intervalGap(candidate.interval, busy) < buffer,
    );

    if (overlap) {
      conflicts.set(candidate.index, {
        semanticRef: candidate.semanticRef,
        code: "FIXED_OVERLAP",
      });
    } else if (bufferConflict) {
      conflicts.set(candidate.index, {
        semanticRef: candidate.semanticRef,
        code: "FIXED_BUFFER_CONFLICT",
      });
    }
  }

  const pairEligible = fixed.filter((candidate) => !conflicts.has(candidate.index));

  for (let leftIndex = 0; leftIndex < pairEligible.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < pairEligible.length; rightIndex += 1) {
      const left = pairEligible[leftIndex];
      const right = pairEligible[rightIndex];

      if (left === undefined || right === undefined) {
        continue;
      }

      const overlap = intervalsOverlap(left.interval, right.interval);
      const bufferConflict = !overlap && intervalGap(left.interval, right.interval) < buffer;

      if (!overlap && !bufferConflict) {
        continue;
      }

      const code = overlap ? "FIXED_OVERLAP" : "FIXED_BUFFER_CONFLICT";
      conflicts.set(left.index, { semanticRef: left.semanticRef, code });
      conflicts.set(right.index, { semanticRef: right.semanticRef, code });
    }
  }
}

export function parseFlexibleCandidates(
  input: RawSchedulingInput,
  workWindows: readonly InstantInterval[],
  conflicts: Map<number, SchedulingConflict>,
): IndexedFlexibleCandidate[] {
  const flexible: IndexedFlexibleCandidate[] = [];

  input.candidates.forEach((candidate, index) => {
    if (candidate.kind !== "flexible" || conflicts.has(index)) {
      return;
    }

    const duration = minutesToNanoseconds(candidate.durationMinutes);

    if (duration === null || duration === 0n) {
      conflicts.set(index, { semanticRef: candidate.semanticRef, code: "INVALID_DURATION" });
      return;
    }

    const earliestStart = parseOptionalInstant(candidate.earliestStartAt);
    const deadline = parseOptionalInstant(candidate.deadlineAt);

    if (
      earliestStart === undefined ||
      deadline === undefined ||
      (earliestStart !== null && deadline !== null && deadline <= earliestStart)
    ) {
      conflicts.set(index, { semanticRef: candidate.semanticRef, code: "INVALID_CONSTRAINT" });
      return;
    }

    const parsed: IndexedFlexibleCandidate = {
      index,
      semanticRef: candidate.semanticRef,
      duration,
      earliestStart,
      deadline,
    };

    if (!isStructurallyPossible(parsed, workWindows)) {
      conflicts.set(index, {
        semanticRef: candidate.semanticRef,
        code: "IMPOSSIBLE_CONSTRAINTS",
      });
      return;
    }

    flexible.push(parsed);
  });

  return flexible;
}

function findDuplicateReferences(input: RawSchedulingInput): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const candidate of input.candidates) {
    if (seen.has(candidate.semanticRef)) {
      duplicates.add(candidate.semanticRef);
    }
    seen.add(candidate.semanticRef);
  }

  return duplicates;
}

function parseOptionalInstant(value: string | undefined): bigint | null | undefined {
  if (value === undefined) {
    return null;
  }

  return parseInstant(value) ?? undefined;
}

function isStructurallyPossible(
  candidate: IndexedFlexibleCandidate,
  workWindows: readonly InstantInterval[],
): boolean {
  return workWindows.some((window) => {
    const start =
      candidate.earliestStart !== null && candidate.earliestStart > window.start
        ? candidate.earliestStart
        : window.start;
    const end =
      candidate.deadline !== null && candidate.deadline < window.end ? candidate.deadline : window.end;

    return end - start >= candidate.duration;
  });
}
