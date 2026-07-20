import { Temporal } from "temporal-polyfill";

import type {
  TaskOccurrenceRangeQuery,
  OccurrenceState,
  TaskOccurrenceDto,
} from "./contracts/occurrence-contract";
import type { RecurrenceExpansionPort } from "./recurrence-expansion-port";
import { createProjectedOccurrenceKey, type DecodedOccurrenceKey } from "../domain/recurrence/occurrence-key";
import { recurrenceIncludesCandidate } from "../domain/recurrence/recurrence-candidate-membership";
import {
  occurrenceStartsWithinProjection,
  type RecurrenceOccurrenceStart,
  type RecurrenceProjectionWindow,
} from "../domain/recurrence/recurrence-cutover-policy";
import type { RecurrenceRule } from "../domain/recurrence/recurrence-policy";
import type { RecurrenceLocalRange } from "../domain/recurrence/recurrence-expansion";
import {
  projectRecurrenceCandidate,
  recurrenceAnchorLocalStart,
  type LocalRecurrenceStart,
  type RecurrenceOccurrenceSchedule,
  type RecurrenceScheduleAnchor,
} from "../domain/recurrence/recurrence-time-policy";

const DAY_NANOSECONDS = 24n * 60n * 60n * 1_000_000_000n;

export type OccurrenceProjectionCandidate = Readonly<{
  occurrence: TaskOccurrenceDto;
  sortStart: bigint;
}>;

export type OccurrenceProjectionIdentity =
  | Readonly<{ kind: "generated"; candidate: LocalRecurrenceStart }>
  | Readonly<{ kind: "recorded"; occurrenceKey: string }>;

export type ExpandedOccurrenceSchedule = Readonly<{
  candidate: LocalRecurrenceStart;
  schedule: RecurrenceOccurrenceSchedule;
}>;

export function expandOccurrenceSchedules(
  input: Readonly<{
    expansion: RecurrenceExpansionPort;
    rule: RecurrenceRule;
    anchor: RecurrenceScheduleAnchor;
    projection: RecurrenceProjectionWindow;
    query: TaskOccurrenceRangeQuery;
    candidateLimit: number;
  }>,
): Readonly<{ schedules: readonly ExpandedOccurrenceSchedule[]; truncated: boolean; evaluated: number }> {
  const result = input.expansion.expand({
    rule: input.rule,
    anchor: input.anchor,
    range: expansionRange(input.anchor, input.query),
    candidateLimit: input.candidateLimit,
  });
  return {
    schedules: result.candidates
      .map((candidate) => ({
        candidate,
        schedule: projectRecurrenceCandidate(input.anchor, candidate),
      }))
      .filter(
        ({ schedule }) =>
          occurrenceStartsWithinProjection(input.projection, occurrenceStart(schedule)) &&
          occurrenceOverlapsRange(schedule, input.query),
      ),
    truncated: result.truncated,
    evaluated: result.candidates.length,
  };
}

export function createOccurrenceProjection(
  taskId: string,
  taskVersion: number,
  schedule: RecurrenceOccurrenceSchedule,
  occurrenceState: OccurrenceState,
  userTimezone: string,
  identity: OccurrenceProjectionIdentity,
): OccurrenceProjectionCandidate {
  const key =
    identity.kind === "recorded"
      ? identity.occurrenceKey
      : createProjectedOccurrenceKey(
          taskId,
          occurrenceStart(schedule),
          identity.candidate,
          schedule.timezone,
        );
  return {
    occurrence: {
      taskId,
      taskVersion,
      occurrenceKey: key,
      occurrenceState,
      schedule: occurrenceScheduleValue(schedule),
    },
    sortStart: scheduleSortStart(schedule, userTimezone),
  };
}

export function projectRecordedOccurrence(
  anchor: RecurrenceScheduleAnchor,
  decoded: DecodedOccurrenceKey,
): RecurrenceOccurrenceSchedule | null {
  if (anchor.kind === "all_day" && decoded.kind === "all_day") {
    const duration = Temporal.PlainDate.from(anchor.startDate).until(anchor.endDate).days;
    return {
      kind: "all_day",
      startDate: decoded.startDate,
      endDate: Temporal.PlainDate.from(decoded.startDate).add({ days: duration }).toString(),
      timezone: anchor.timezone,
    };
  }
  if (anchor.kind !== "timed" || decoded.kind !== "timed") return null;
  const duration =
    Temporal.Instant.from(anchor.endAt).epochNanoseconds -
    Temporal.Instant.from(anchor.startAt).epochNanoseconds;
  const end = Temporal.Instant.fromEpochNanoseconds(
    Temporal.Instant.from(decoded.startAt).epochNanoseconds + duration,
  );
  return {
    kind: "timed",
    startAt: decoded.startAt,
    endAt: end.toString(),
    timezone: anchor.timezone,
  };
}

export function isEligibleOccurrence(
  input: Readonly<{
    rule: RecurrenceRule;
    anchor: RecurrenceScheduleAnchor;
    projection: RecurrenceProjectionWindow;
    decoded: DecodedOccurrenceKey;
  }>,
): boolean {
  const candidate = decodedLocalCandidate(input.anchor, input.decoded);
  if (!candidate) return false;
  const decodedOccurrenceStart = decodedStart(input.decoded);
  if (!occurrenceStartsWithinProjection(input.projection, decodedOccurrenceStart)) return false;
  if (!recurrenceIncludesCandidate(input.rule, input.anchor, candidate)) return false;
  const start = occurrenceStart(projectRecurrenceCandidate(input.anchor, candidate));
  return sameOccurrenceStart(start, decodedOccurrenceStart);
}

export function occurrenceOverlapsRange(
  schedule: RecurrenceOccurrenceSchedule,
  query: TaskOccurrenceRangeQuery,
): boolean {
  if (schedule.kind === "all_day") {
    return schedule.startDate < query.rangeEndDate && schedule.endDate > query.rangeStartDate;
  }
  const start = Temporal.Instant.from(schedule.startAt);
  const end = Temporal.Instant.from(schedule.endAt);
  const rangeStart = Temporal.Instant.from(query.rangeStartAt);
  const rangeEnd = Temporal.Instant.from(query.rangeEndAt);
  return (
    Temporal.Instant.compare(start, rangeEnd) < 0 &&
    (Temporal.Instant.compare(end, rangeStart) > 0 ||
      (start.equals(end) && Temporal.Instant.compare(start, rangeStart) >= 0))
  );
}

export function scheduleSortStart(schedule: RecurrenceOccurrenceSchedule, userTimezone: string): bigint {
  return schedule.kind === "all_day"
    ? Temporal.PlainDate.from(schedule.startDate)
        .toZonedDateTime({ timeZone: userTimezone, plainTime: "00:00" })
        .toInstant().epochNanoseconds
    : Temporal.Instant.from(schedule.startAt).epochNanoseconds;
}

function expansionRange(
  anchor: RecurrenceScheduleAnchor,
  query: TaskOccurrenceRangeQuery,
): RecurrenceLocalRange {
  if (anchor.kind === "all_day") {
    const duration = Temporal.PlainDate.from(anchor.startDate).until(anchor.endDate).days;
    return {
      kind: "all_day",
      rangeStartDate: Temporal.PlainDate.from(query.rangeStartDate).subtract({ days: duration }).toString(),
      rangeEndDate: query.rangeEndDate,
    };
  }
  const duration =
    Temporal.Instant.from(anchor.endAt).epochNanoseconds -
    Temporal.Instant.from(anchor.startAt).epochNanoseconds;
  const paddedStart = Temporal.Instant.fromEpochNanoseconds(
    Temporal.Instant.from(query.rangeStartAt).epochNanoseconds - duration - DAY_NANOSECONDS,
  );
  const paddedEnd = Temporal.Instant.fromEpochNanoseconds(
    Temporal.Instant.from(query.rangeEndAt).epochNanoseconds + DAY_NANOSECONDS,
  );
  return {
    kind: "timed",
    rangeStartLocalDateTime: minuteString(
      floorMinute(paddedStart.toZonedDateTimeISO(anchor.timezone).toPlainDateTime()),
    ),
    rangeEndLocalDateTime: minuteString(
      ceilMinute(paddedEnd.toZonedDateTimeISO(anchor.timezone).toPlainDateTime()),
    ),
  };
}

function occurrenceScheduleValue(schedule: RecurrenceOccurrenceSchedule) {
  return schedule.kind === "all_day"
    ? { kind: "all_day" as const, startDate: schedule.startDate, endDate: schedule.endDate }
    : schedule;
}

function occurrenceStart(schedule: RecurrenceOccurrenceSchedule): RecurrenceOccurrenceStart {
  return schedule.kind === "all_day"
    ? { kind: "all_day", startDate: schedule.startDate }
    : { kind: "timed", startAt: schedule.startAt };
}

function decodedStart(decoded: DecodedOccurrenceKey): RecurrenceOccurrenceStart {
  return decoded.kind === "all_day"
    ? { kind: "all_day", startDate: decoded.startDate }
    : { kind: "timed", startAt: decoded.startAt };
}

function decodedLocalCandidate(
  anchor: RecurrenceScheduleAnchor,
  decoded: DecodedOccurrenceKey,
): LocalRecurrenceStart | null {
  if (anchor.kind === "all_day" && decoded.kind === "all_day") {
    return { kind: "all_day", startDate: decoded.startDate };
  }
  if (anchor.kind !== "timed" || decoded.kind !== "timed") return null;
  if (decoded.startLocalDateTime !== undefined) {
    const projectedLocalDate = Temporal.Instant.from(decoded.startAt)
      .toZonedDateTimeISO(anchor.timezone)
      .toPlainDate()
      .toString();
    const candidateLocalDate = Temporal.PlainDateTime.from(decoded.startLocalDateTime)
      .toPlainDate()
      .toString();
    if (projectedLocalDate === candidateLocalDate) return null;
    return { kind: "timed", startLocalDateTime: decoded.startLocalDateTime };
  }
  const localDate = Temporal.Instant.from(decoded.startAt).toZonedDateTimeISO(anchor.timezone).toPlainDate();
  const anchorLocalStart = recurrenceAnchorLocalStart(anchor);
  if (anchorLocalStart.kind !== "timed") return null;
  const anchorTime = Temporal.PlainDateTime.from(anchorLocalStart.startLocalDateTime).toPlainTime();
  return {
    kind: "timed",
    startLocalDateTime: minuteString(localDate.toPlainDateTime(anchorTime)),
  };
}

function sameOccurrenceStart(left: RecurrenceOccurrenceStart, right: RecurrenceOccurrenceStart) {
  return left.kind === "all_day" && right.kind === "all_day"
    ? left.startDate === right.startDate
    : left.kind === "timed" &&
        right.kind === "timed" &&
        Temporal.Instant.compare(left.startAt, right.startAt) === 0;
}

function floorMinute(value: Temporal.PlainDateTime): Temporal.PlainDateTime {
  return value.with({ second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 });
}

function ceilMinute(value: Temporal.PlainDateTime): Temporal.PlainDateTime {
  const floor = floorMinute(value);
  return Temporal.PlainDateTime.compare(floor, value) === 0 ? floor : floor.add({ minutes: 1 });
}

function minuteString(value: Temporal.PlainDateTime): string {
  return value.toString({ smallestUnit: "minute" });
}
