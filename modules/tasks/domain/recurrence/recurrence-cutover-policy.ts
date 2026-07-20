import { Temporal } from "temporal-polyfill";

import { assertCanonicalLocalDate } from "./recurrence-policy";
import { assertRecurrenceScheduleAnchor, type RecurrenceScheduleAnchor } from "./recurrence-time-policy";

export type RecurrenceProjectionWindow =
  | Readonly<{
      kind: "all_day";
      projectionStartDate: string;
      projectionEndDate: string | null;
    }>
  | Readonly<{
      kind: "timed";
      projectionStartAt: string;
      projectionEndAt: string | null;
    }>;

export type RecurrenceOccurrenceStart =
  Readonly<{ kind: "all_day"; startDate: string }> | Readonly<{ kind: "timed"; startAt: string }>;

export function initialRecurrenceProjection(anchor: RecurrenceScheduleAnchor): RecurrenceProjectionWindow {
  assertRecurrenceScheduleAnchor(anchor);
  return anchor.kind === "all_day"
    ? {
        kind: "all_day",
        projectionStartDate: anchor.startDate,
        projectionEndDate: null,
      }
    : { kind: "timed", projectionStartAt: anchor.startAt, projectionEndAt: null };
}

export function restartRecurrenceProjection(
  current: RecurrenceProjectionWindow,
  lower: RecurrenceOccurrenceStart,
): RecurrenceProjectionWindow {
  assertRecurrenceProjectionWindow(current);
  assertMatchingKind(current.kind, lower.kind);
  return lower.kind === "all_day"
    ? { kind: "all_day", projectionStartDate: canonicalDate(lower.startDate), projectionEndDate: null }
    : { kind: "timed", projectionStartAt: canonicalInstant(lower.startAt), projectionEndAt: null };
}

export function endRecurrenceProjection(
  current: RecurrenceProjectionWindow,
  upper: RecurrenceOccurrenceStart,
): RecurrenceProjectionWindow {
  assertRecurrenceProjectionWindow(current);
  assertMatchingKind(current.kind, upper.kind);

  if (current.kind === "all_day" && upper.kind === "all_day") {
    const end = canonicalDate(upper.startDate);
    if (Temporal.PlainDate.compare(end, current.projectionStartDate) < 0) {
      throw new RangeError("An all-day projection end cannot precede its lower cutover.");
    }
    return { ...current, projectionEndDate: end };
  }

  if (current.kind !== "timed" || upper.kind !== "timed") {
    throw new RangeError("The recurrence cutover kind does not match its projection.");
  }
  const end = canonicalInstant(upper.startAt);
  if (Temporal.Instant.compare(end, current.projectionStartAt) < 0) {
    throw new RangeError("A timed projection end cannot precede its lower cutover.");
  }
  return { ...current, projectionEndAt: end };
}

export function assertRecurrenceProjectionWindow(window: RecurrenceProjectionWindow): void {
  if (window.kind === "all_day") {
    const start = canonicalDate(window.projectionStartDate);
    if (
      window.projectionEndDate !== null &&
      Temporal.PlainDate.compare(canonicalDate(window.projectionEndDate), start) < 0
    ) {
      throw new RangeError("An all-day projection end cannot precede its lower cutover.");
    }
    return;
  }

  const start = canonicalInstant(window.projectionStartAt);
  if (
    window.projectionEndAt !== null &&
    Temporal.Instant.compare(canonicalInstant(window.projectionEndAt), start) < 0
  ) {
    throw new RangeError("A timed projection end cannot precede its lower cutover.");
  }
}

export function occurrenceStartsWithinProjection(
  window: RecurrenceProjectionWindow,
  occurrence: RecurrenceOccurrenceStart,
): boolean {
  assertRecurrenceProjectionWindow(window);
  assertMatchingKind(window.kind, occurrence.kind);

  if (window.kind === "all_day" && occurrence.kind === "all_day") {
    const start = canonicalDate(occurrence.startDate);
    return (
      Temporal.PlainDate.compare(start, window.projectionStartDate) >= 0 &&
      (window.projectionEndDate === null || Temporal.PlainDate.compare(start, window.projectionEndDate) < 0)
    );
  }

  if (window.kind !== "timed" || occurrence.kind !== "timed") return false;
  const start = canonicalInstant(occurrence.startAt);
  return (
    Temporal.Instant.compare(start, window.projectionStartAt) >= 0 &&
    (window.projectionEndAt === null || Temporal.Instant.compare(start, window.projectionEndAt) < 0)
  );
}

export function occurrenceStartsStrictlyAfterNow(
  occurrence: RecurrenceOccurrenceStart,
  nowAt: string,
  timezone: string,
): boolean {
  const now = Temporal.Instant.from(nowAt);
  if (occurrence.kind === "timed") {
    return Temporal.Instant.compare(canonicalInstant(occurrence.startAt), now) > 0;
  }
  const currentLocalDate = now.toZonedDateTimeISO(timezone).toPlainDate();
  return Temporal.PlainDate.compare(canonicalDate(occurrence.startDate), currentLocalDate) > 0;
}

export function fallbackEndCutover(
  kind: RecurrenceProjectionWindow["kind"],
  nowAt: string,
  timezone: string,
): RecurrenceOccurrenceStart {
  const now = Temporal.Instant.from(nowAt);
  if (kind === "timed") return { kind: "timed", startAt: now.toString() };

  const tomorrow = now.toZonedDateTimeISO(timezone).toPlainDate().add({ days: 1 });
  return { kind: "all_day", startDate: tomorrow.toString() };
}

function canonicalDate(value: string): string {
  assertCanonicalLocalDate(value, "Recurrence date cutover");
  return value;
}

function canonicalInstant(value: string): string {
  try {
    return Temporal.Instant.from(value).toString();
  } catch {
    throw new RangeError("Recurrence instant cutover is invalid.");
  }
}

function assertMatchingKind(
  windowKind: RecurrenceProjectionWindow["kind"],
  occurrenceKind: RecurrenceOccurrenceStart["kind"],
): void {
  if (windowKind !== occurrenceKind) {
    throw new RangeError("The recurrence cutover kind does not match its projection.");
  }
}
