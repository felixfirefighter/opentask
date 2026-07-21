import { Temporal } from "temporal-polyfill";

import type { TaskOccurrenceRangeQuery } from "./contracts/occurrence-contract";
import { decodeOccurrenceKey, type DecodedOccurrenceKey } from "../domain/recurrence/occurrence-key";
import { MAX_RECURRENCE_DURATION_DAYS } from "../domain/recurrence/recurrence-time-policy";

const MAX_TIMED_DURATION_NANOSECONDS =
  BigInt(MAX_RECURRENCE_DURATION_DAYS) * 24n * 60n * 60n * 1_000_000_000n;

type OccurrenceEventIdentity = Readonly<{
  taskId: string;
  occurrenceKey: string;
}>;

export type SelectedHistoricalOccurrenceEvent<T extends OccurrenceEventIdentity> = Readonly<{
  event: T;
  decoded: DecodedOccurrenceKey;
}>;

/**
 * Event rows retain only canonical occurrence starts. Select the bounded superset that could overlap
 * the requested range under the approved maximum recurrence duration; the current anchor supplies
 * the exact duration during projection.
 */
export function selectPotentiallyOverlappingHistoricalEvents<T extends OccurrenceEventIdentity>(
  events: readonly T[],
  query: TaskOccurrenceRangeQuery,
): readonly SelectedHistoricalOccurrenceEvent<T>[] {
  const paddedStartDate = Temporal.PlainDate.from(query.rangeStartDate).subtract({
    days: MAX_RECURRENCE_DURATION_DAYS,
  });
  const rangeEndDate = Temporal.PlainDate.from(query.rangeEndDate);
  const paddedStartAt = Temporal.Instant.fromEpochNanoseconds(
    Temporal.Instant.from(query.rangeStartAt).epochNanoseconds - MAX_TIMED_DURATION_NANOSECONDS,
  );
  const rangeEndAt = Temporal.Instant.from(query.rangeEndAt);

  return events.flatMap((event) => {
    const decoded = decodeOccurrenceKey(event.occurrenceKey, event.taskId);
    const couldOverlap =
      decoded.kind === "all_day"
        ? Temporal.PlainDate.compare(decoded.startDate, rangeEndDate) < 0 &&
          Temporal.PlainDate.compare(decoded.startDate, paddedStartDate) > 0
        : Temporal.Instant.compare(decoded.startAt, rangeEndAt) < 0 &&
          Temporal.Instant.compare(decoded.startAt, paddedStartAt) > 0;
    return couldOverlap ? [{ event, decoded }] : [];
  });
}
