import { assertScheduleQueryBounds } from "../schedule/schedule-bounds";

export const MAX_RECURRENCE_ROWS_PER_REQUEST = 500;
export const MAX_RECURRENCE_CANDIDATES_PER_SERIES = 1_000;
export const MAX_RECURRENCE_CANDIDATES_PER_REQUEST = 50_000;
export const MAX_SCHEDULE_AND_OCCURRENCE_ROWS = 500;

export type RecurrenceExpansionBudget = Readonly<{
  recurrenceRows: number;
  candidateCount: number;
  outputRows: number;
}>;

export function assertRecurrenceRangeBounds(
  rangeStartDate: string,
  rangeEndDate: string,
  rangeStartAt: string,
  rangeEndAt: string,
): void {
  assertScheduleQueryBounds(rangeStartDate, rangeEndDate, rangeStartAt, rangeEndAt);
}

export function assertRecurrenceSeriesCandidateLimit(limit: number): void {
  assertWholeCount(limit, MAX_RECURRENCE_CANDIDATES_PER_SERIES, "Per-series candidate limit");
}

export function assertRecurrenceExpansionBudget(budget: RecurrenceExpansionBudget): void {
  assertWholeCount(budget.recurrenceRows, MAX_RECURRENCE_ROWS_PER_REQUEST, "Recurrence row count", true);
  assertWholeCount(
    budget.candidateCount,
    MAX_RECURRENCE_CANDIDATES_PER_REQUEST,
    "Recurrence candidate count",
    true,
  );
  assertWholeCount(budget.outputRows, MAX_SCHEDULE_AND_OCCURRENCE_ROWS, "Projection row count", true);
}

function assertWholeCount(value: number, maximum: number, label: string, allowZero = false): void {
  const minimum = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be from ${minimum} to ${maximum}.`);
  }
}
