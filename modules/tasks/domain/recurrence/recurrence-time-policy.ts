import { Temporal } from "temporal-polyfill";

import { instantToLocalDateTime, resolveLocalDateTime } from "../schedule/zoned-date-time";
import {
  assertCanonicalLocalDate,
  assertRecurrenceRule,
  recurrencePresetIncludesAnchor,
  type RecurrenceRule,
} from "./recurrence-policy";

const MINUTE_NANOSECONDS = 60n * 1_000_000_000n;
export const MAX_RECURRENCE_DURATION_DAYS = 31;
const MAX_RECURRING_DURATION_NANOSECONDS =
  BigInt(MAX_RECURRENCE_DURATION_DAYS) * 24n * 60n * MINUTE_NANOSECONDS;
const supportedIanaTimezones = new Set(Intl.supportedValuesOf("timeZone"));

export type RecurrenceScheduleAnchor =
  | Readonly<{
      kind: "all_day";
      startDate: string;
      endDate: string;
      timezone: string;
    }>
  | Readonly<{
      kind: "timed";
      startAt: string;
      endAt: string;
      timezone: string;
    }>;

export type LocalRecurrenceStart =
  Readonly<{ kind: "all_day"; startDate: string }> | Readonly<{ kind: "timed"; startLocalDateTime: string }>;

export type RecurrenceOccurrenceSchedule =
  | Readonly<{
      kind: "all_day";
      startDate: string;
      endDate: string;
      timezone: string;
    }>
  | Readonly<{
      kind: "timed";
      startAt: string;
      endAt: string;
      timezone: string;
    }>;

export function assertRecurrenceEligibility(rule: RecurrenceRule, anchor: RecurrenceScheduleAnchor): void {
  assertRecurrenceRule(rule);
  assertRecurrenceScheduleAnchor(anchor);

  const anchorDate = recurrenceAnchorLocalDate(anchor);
  if (!recurrencePresetIncludesAnchor(rule.preset, anchorDate)) {
    throw new RangeError("The schedule anchor must match the selected weekday preset.");
  }
  if (rule.end.kind === "until" && Temporal.PlainDate.compare(rule.end.untilDate, anchorDate) < 0) {
    throw new RangeError("The recurrence end date cannot precede its schedule anchor.");
  }
}

export function assertRecurrenceScheduleAnchor(anchor: RecurrenceScheduleAnchor): void {
  assertIanaTimezone(anchor.timezone);

  if (anchor.kind === "all_day") {
    assertCanonicalLocalDate(anchor.startDate, "All-day recurrence start");
    assertCanonicalLocalDate(anchor.endDate, "All-day recurrence end");
    const duration = Temporal.PlainDate.from(anchor.startDate).until(anchor.endDate).days;
    if (duration < 1 || duration > MAX_RECURRENCE_DURATION_DAYS) {
      throw new RangeError(
        `An all-day recurrence duration must be from 1 to ${MAX_RECURRENCE_DURATION_DAYS} calendar days.`,
      );
    }
    return;
  }

  const start = parseInstant(anchor.startAt, "Timed recurrence start");
  const end = parseInstant(anchor.endAt, "Timed recurrence end");
  if (
    start.epochNanoseconds % MINUTE_NANOSECONDS !== 0n ||
    end.epochNanoseconds % MINUTE_NANOSECONDS !== 0n
  ) {
    throw new RangeError("A recurring timed schedule must be whole-minute aligned.");
  }

  const duration = end.epochNanoseconds - start.epochNanoseconds;
  if (duration < 0n || duration > MAX_RECURRING_DURATION_NANOSECONDS) {
    throw new RangeError(
      `A timed recurrence duration must be from 0 to ${MAX_RECURRENCE_DURATION_DAYS} exact elapsed days.`,
    );
  }

  const localStart = instantToLocalDateTime(anchor.startAt, anchor.timezone);
  const resolution = resolveLocalDateTime(localStart, anchor.timezone);
  if (
    resolution.kind === "fold" &&
    !Temporal.Instant.from(anchor.startAt).equals(Temporal.Instant.from(resolution.earlierInstant))
  ) {
    throw new RangeError("A timed recurrence anchor cannot select the later instant of a DST fold.");
  }
}

export function recurrenceAnchorLocalStart(anchor: RecurrenceScheduleAnchor): LocalRecurrenceStart {
  assertRecurrenceScheduleAnchor(anchor);
  if (anchor.kind === "all_day") return { kind: "all_day", startDate: anchor.startDate };

  return {
    kind: "timed",
    startLocalDateTime: canonicalMinuteLocalDateTime(
      instantToLocalDateTime(anchor.startAt, anchor.timezone),
      "Timed recurrence anchor",
    ),
  };
}

export function recurrenceAnchorLocalDate(anchor: RecurrenceScheduleAnchor): string {
  if (anchor.kind === "all_day") return anchor.startDate;
  return Temporal.Instant.from(anchor.startAt).toZonedDateTimeISO(anchor.timezone).toPlainDate().toString();
}

export function projectRecurrenceCandidate(
  anchor: RecurrenceScheduleAnchor,
  candidate: LocalRecurrenceStart,
): RecurrenceOccurrenceSchedule {
  assertRecurrenceScheduleAnchor(anchor);
  assertMatchingKind(anchor.kind, candidate.kind);

  if (anchor.kind === "all_day" && candidate.kind === "all_day") {
    assertCanonicalLocalDate(candidate.startDate, "All-day recurrence candidate");
    const durationDays = Temporal.PlainDate.from(anchor.startDate).until(anchor.endDate).days;
    return {
      kind: "all_day",
      startDate: candidate.startDate,
      endDate: Temporal.PlainDate.from(candidate.startDate).add({ days: durationDays }).toString(),
      timezone: anchor.timezone,
    };
  }

  if (anchor.kind !== "timed" || candidate.kind !== "timed") {
    throw new RangeError("The recurrence candidate kind does not match its schedule anchor.");
  }

  const localStart = canonicalMinuteLocalDateTime(candidate.startLocalDateTime, "Timed recurrence candidate");
  const resolution = resolveLocalDateTime(localStart, anchor.timezone);
  const startAt =
    resolution.kind === "exact"
      ? resolution.instant
      : resolution.kind === "gap"
        ? resolution.laterInstant
        : resolution.earlierInstant;
  const durationNanoseconds =
    Temporal.Instant.from(anchor.endAt).epochNanoseconds -
    Temporal.Instant.from(anchor.startAt).epochNanoseconds;
  const endAt = Temporal.Instant.fromEpochNanoseconds(
    Temporal.Instant.from(startAt).epochNanoseconds + durationNanoseconds,
  ).toString();

  return { kind: "timed", startAt, endAt, timezone: anchor.timezone };
}

export function canonicalMinuteLocalDateTime(value: string, label = "Local date-time"): string {
  let parsed: Temporal.PlainDateTime;
  try {
    parsed = Temporal.PlainDateTime.from(value);
  } catch {
    throw new RangeError(`${label} is invalid.`);
  }
  if (
    parsed.second !== 0 ||
    parsed.millisecond !== 0 ||
    parsed.microsecond !== 0 ||
    parsed.nanosecond !== 0
  ) {
    throw new RangeError(`${label} must be whole-minute aligned.`);
  }
  return parsed.toString({ smallestUnit: "minute" });
}

function assertIanaTimezone(timezone: string): void {
  if (timezone !== "UTC" && !supportedIanaTimezones.has(timezone)) {
    throw new RangeError("The recurrence timezone is invalid.");
  }
}

function parseInstant(value: string, label: string): Temporal.Instant {
  try {
    return Temporal.Instant.from(value);
  } catch {
    throw new RangeError(`${label} is invalid.`);
  }
}

function assertMatchingKind(
  anchorKind: RecurrenceScheduleAnchor["kind"],
  candidateKind: LocalRecurrenceStart["kind"],
): void {
  if (anchorKind !== candidateKind) {
    throw new RangeError("The recurrence candidate kind does not match its schedule anchor.");
  }
}
