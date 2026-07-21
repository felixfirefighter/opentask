import { Temporal } from "temporal-polyfill";

import { assertRecurrenceSeriesCandidateLimit } from "./recurrence-limits";
import type { RecurrenceRule } from "./recurrence-policy";
import {
  assertRecurrenceEligibility,
  canonicalMinuteLocalDateTime,
  type LocalRecurrenceStart,
  type RecurrenceScheduleAnchor,
} from "./recurrence-time-policy";

export type RecurrenceLocalRange =
  | Readonly<{ kind: "all_day"; rangeStartDate: string; rangeEndDate: string }>
  | Readonly<{
      kind: "timed";
      rangeStartLocalDateTime: string;
      rangeEndLocalDateTime: string;
    }>;

export type RecurrenceExpansionRequest = Readonly<{
  rule: RecurrenceRule;
  anchor: RecurrenceScheduleAnchor;
  range: RecurrenceLocalRange;
  candidateLimit: number;
}>;

export type RecurrenceExpansionResult = Readonly<{
  candidates: readonly LocalRecurrenceStart[];
  truncated: boolean;
}>;

export type NextRecurrenceCandidateRequest = Readonly<{
  rule: RecurrenceRule;
  anchor: RecurrenceScheduleAnchor;
  after: LocalRecurrenceStart;
}>;

export function assertRecurrenceExpansionRequest(request: RecurrenceExpansionRequest): void {
  assertRecurrenceEligibility(request.rule, request.anchor);
  assertRecurrenceSeriesCandidateLimit(request.candidateLimit);
  assertMatchingKinds(request.anchor.kind, request.range.kind);

  if (request.range.kind === "all_day") {
    const start = Temporal.PlainDate.from(request.range.rangeStartDate);
    const end = Temporal.PlainDate.from(request.range.rangeEndDate);
    if (start.toString() !== request.range.rangeStartDate || end.toString() !== request.range.rangeEndDate) {
      throw new RangeError("All-day expansion bounds must use canonical local dates.");
    }
    if (Temporal.PlainDate.compare(end, start) <= 0) {
      throw new RangeError("A recurrence expansion range must be non-empty.");
    }
    return;
  }

  const start = parseLocalRangeBoundary(request.range.rangeStartLocalDateTime);
  const end = parseLocalRangeBoundary(request.range.rangeEndLocalDateTime);
  if (Temporal.PlainDateTime.compare(end, start) <= 0) {
    throw new RangeError("A recurrence expansion range must be non-empty.");
  }
}

function parseLocalRangeBoundary(value: string): Temporal.PlainDateTime {
  let parsed: Temporal.PlainDateTime;
  try {
    parsed = Temporal.PlainDateTime.from(value);
  } catch {
    throw new RangeError("The timed recurrence expansion bound is invalid.");
  }
  if (parsed.microsecond !== 0 || parsed.nanosecond !== 0) {
    throw new RangeError("Timed recurrence expansion bounds cannot be more precise than milliseconds.");
  }
  return parsed;
}

export function assertNextRecurrenceCandidateRequest(request: NextRecurrenceCandidateRequest): void {
  assertRecurrenceEligibility(request.rule, request.anchor);
  assertMatchingKinds(request.anchor.kind, request.after.kind);
  if (request.after.kind === "all_day") {
    const parsed = Temporal.PlainDate.from(request.after.startDate);
    if (parsed.toString() !== request.after.startDate) {
      throw new RangeError("The all-day recurrence cursor must use a canonical local date.");
    }
  } else {
    canonicalMinuteLocalDateTime(request.after.startLocalDateTime, "Timed recurrence cursor");
  }
}

function assertMatchingKinds(
  anchorKind: RecurrenceScheduleAnchor["kind"],
  otherKind: RecurrenceLocalRange["kind"] | LocalRecurrenceStart["kind"],
): void {
  if (anchorKind !== otherKind) {
    throw new RangeError("Recurrence expansion values must match the schedule anchor kind.");
  }
}
