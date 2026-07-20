import { Temporal } from "temporal-polyfill";

import type { RecurrenceOccurrenceStart } from "./recurrence-cutover-policy";
import { assertCanonicalLocalDate } from "./recurrence-policy";
import {
  canonicalMinuteLocalDateTime,
  MAX_RECURRENCE_DURATION_DAYS,
  type LocalRecurrenceStart,
} from "./recurrence-time-policy";

export const OCCURRENCE_KEY_MAX_LENGTH = 80;
const OCCURRENCE_KEY_PREFIX = "o1.";
const DISAMBIGUATED_TIMED_KEY_PREFIX = "o2.";
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const COMPACT_UUID_PATTERN = /^[0-9a-f]{32}$/;
const BASE36_INTEGER_PATTERN = /^(0|-?[1-9a-z][0-9a-z]*)$/;
const MAX_RECURRENCE_DURATION_MILLISECONDS = MAX_RECURRENCE_DURATION_DAYS * 24 * 60 * 60 * 1_000;
const MAX_OCCURRENCE_START_EPOCH_MILLISECONDS = 8_640_000_000_000_000 - MAX_RECURRENCE_DURATION_MILLISECONDS;
const MAX_OCCURRENCE_START_DATE = Temporal.PlainDate.from("+275760-09-13")
  .subtract({ days: MAX_RECURRENCE_DURATION_DAYS })
  .toString();

export type DecodedOccurrenceKey =
  | Readonly<{ taskId: string; kind: "all_day"; startDate: string }>
  | Readonly<{
      taskId: string;
      kind: "timed";
      epochMilliseconds: number;
      startAt: string;
      startLocalDateTime?: string;
    }>;

export function createOccurrenceKey(taskId: string, occurrence: RecurrenceOccurrenceStart): string {
  const normalizedTaskId = canonicalTaskId(taskId);
  const payload =
    occurrence.kind === "all_day"
      ? `${normalizedTaskId}|d|${canonicalDate(occurrence.startDate)}`
      : `${normalizedTaskId}|t|${epochMillisecondsFor(occurrence.startAt)}`;
  const key = `${OCCURRENCE_KEY_PREFIX}${encodeBase64Url(payload)}`;
  if (key.length > OCCURRENCE_KEY_MAX_LENGTH) {
    throw new RangeError("The occurrence identity exceeds its storage bound.");
  }
  return key;
}

export function createProjectedOccurrenceKey(
  taskId: string,
  occurrence: RecurrenceOccurrenceStart,
  candidate: LocalRecurrenceStart,
  timezone: string,
): string {
  if (occurrence.kind === "all_day" && candidate.kind === "all_day") {
    if (occurrence.startDate !== candidate.startDate) {
      throw new RangeError("The occurrence identity candidate does not match its projection.");
    }
    return createOccurrenceKey(taskId, occurrence);
  }
  if (occurrence.kind !== "timed" || candidate.kind !== "timed") {
    throw new RangeError("The occurrence identity candidate kind does not match its projection.");
  }

  const canonicalLocalStart = canonicalMinuteLocalDateTime(
    candidate.startLocalDateTime,
    "Timed occurrence identity candidate",
  );
  const projectedLocalDate = Temporal.Instant.from(occurrence.startAt)
    .toZonedDateTimeISO(timezone)
    .toPlainDate()
    .toString();
  const candidateLocalDate = Temporal.PlainDateTime.from(canonicalLocalStart).toPlainDate().toString();
  if (projectedLocalDate === candidateLocalDate) return createOccurrenceKey(taskId, occurrence);

  const normalizedTaskId = canonicalTaskId(taskId);
  const compactTaskId = normalizedTaskId.replaceAll("-", "");
  const instantPart = base36Integer(epochMillisecondsFor(occurrence.startAt));
  const localPart = base36Integer(pseudoUtcEpochMillisecondsFor(canonicalLocalStart));
  const key = `${DISAMBIGUATED_TIMED_KEY_PREFIX}${compactTaskId}_${instantPart}_${localPart}`;
  if (key.length > OCCURRENCE_KEY_MAX_LENGTH) {
    throw new RangeError("The occurrence identity exceeds its storage bound.");
  }
  return key;
}

export function decodeOccurrenceKey(key: string, expectedTaskId?: string): DecodedOccurrenceKey {
  if (key.startsWith(DISAMBIGUATED_TIMED_KEY_PREFIX)) {
    return decodeDisambiguatedTimedKey(key, expectedTaskId);
  }
  if (
    key.length <= OCCURRENCE_KEY_PREFIX.length ||
    key.length > OCCURRENCE_KEY_MAX_LENGTH ||
    !key.startsWith(OCCURRENCE_KEY_PREFIX)
  ) {
    throw new RangeError("The occurrence identity is invalid.");
  }

  const encoded = key.slice(OCCURRENCE_KEY_PREFIX.length);
  const payload = decodeBase64Url(encoded);
  const fields = payload.split("|");
  if (fields.length !== 3) throw new RangeError("The occurrence identity payload is invalid.");
  const [rawTaskId, discriminator, canonicalStart] = fields as [string, string, string];
  const taskId = canonicalTaskId(rawTaskId);
  if (taskId !== rawTaskId) throw new RangeError("The occurrence task identity is not canonical.");
  if (expectedTaskId !== undefined && taskId !== canonicalTaskId(expectedTaskId)) {
    throw new RangeError("The occurrence identity does not belong to the requested task.");
  }

  if (discriminator === "d") {
    return { taskId, kind: "all_day", startDate: canonicalDate(canonicalStart) };
  }
  if (discriminator !== "t" || !/^(0|-?[1-9]\d*)$/.test(canonicalStart)) {
    throw new RangeError("The occurrence start identity is invalid.");
  }

  const epochMilliseconds = Number(canonicalStart);
  if (!Number.isSafeInteger(epochMilliseconds)) {
    throw new RangeError("The occurrence start is outside supported instant bounds.");
  }
  if (String(epochMilliseconds) !== canonicalStart) {
    throw new RangeError("The occurrence start identity is not canonical.");
  }
  let startAt: string;
  try {
    const instant = Temporal.Instant.fromEpochMilliseconds(epochMilliseconds);
    assertOccurrenceInstantBounds(instant);
    startAt = instant.toString();
  } catch {
    throw new RangeError("The occurrence start is outside supported instant bounds.");
  }
  return { taskId, kind: "timed", epochMilliseconds, startAt };
}

function decodeDisambiguatedTimedKey(key: string, expectedTaskId?: string): DecodedOccurrenceKey {
  if (key.length > OCCURRENCE_KEY_MAX_LENGTH) {
    throw new RangeError("The occurrence identity is invalid.");
  }
  const fields = key.slice(DISAMBIGUATED_TIMED_KEY_PREFIX.length).split("_");
  if (fields.length !== 3) throw new RangeError("The occurrence identity payload is invalid.");
  const [compactTaskId, instantPart, localPart] = fields as [string, string, string];
  if (!COMPACT_UUID_PATTERN.test(compactTaskId)) {
    throw new RangeError("The occurrence task identity is invalid.");
  }
  const taskId = canonicalTaskId(expandCompactTaskId(compactTaskId));
  if (expectedTaskId !== undefined && taskId !== canonicalTaskId(expectedTaskId)) {
    throw new RangeError("The occurrence identity does not belong to the requested task.");
  }

  const epochMilliseconds = parseBase36Integer(instantPart, "occurrence instant");
  const localEpochMilliseconds = parseBase36Integer(localPart, "occurrence local start");
  const instant = instantFromEpochMilliseconds(epochMilliseconds);
  assertOccurrenceInstantBounds(instant);
  const localInstant = instantFromEpochMilliseconds(localEpochMilliseconds);
  if (localInstant.epochNanoseconds % (60n * 1_000_000_000n) !== 0n) {
    throw new RangeError("The occurrence local start must be whole-minute aligned.");
  }
  const startLocalDateTime = localInstant
    .toZonedDateTimeISO("UTC")
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
  return {
    taskId,
    kind: "timed",
    epochMilliseconds,
    startAt: instant.toString(),
    startLocalDateTime,
  };
}

function canonicalTaskId(taskId: string): string {
  const canonical = taskId.toLowerCase();
  if (!UUID_V4_PATTERN.test(canonical))
    throw new RangeError("Occurrence identity requires a UUIDv4 task ID.");
  return canonical;
}

function canonicalDate(value: string): string {
  assertCanonicalLocalDate(value, "Occurrence start date");
  if (Temporal.PlainDate.compare(value, MAX_OCCURRENCE_START_DATE) > 0) {
    throw new RangeError("The occurrence start is outside supported recurrence bounds.");
  }
  return value;
}

function epochMillisecondsFor(startAt: string): string {
  let instant: Temporal.Instant;
  try {
    instant = Temporal.Instant.from(startAt);
  } catch {
    throw new RangeError("Occurrence start instant is invalid.");
  }
  if (instant.epochNanoseconds % 1_000_000n !== 0n) {
    throw new RangeError("Occurrence identity requires a whole-millisecond start instant.");
  }
  assertOccurrenceInstantBounds(instant);
  return (instant.epochNanoseconds / 1_000_000n).toString();
}

function pseudoUtcEpochMillisecondsFor(startLocalDateTime: string): string {
  const instant = Temporal.PlainDateTime.from(startLocalDateTime).toZonedDateTime("UTC").toInstant();
  return (instant.epochNanoseconds / 1_000_000n).toString();
}

function assertOccurrenceInstantBounds(instant: Temporal.Instant): void {
  if (instant.epochMilliseconds > MAX_OCCURRENCE_START_EPOCH_MILLISECONDS) {
    throw new RangeError("The occurrence start is outside supported recurrence bounds.");
  }
}

function base36Integer(decimal: string): string {
  const value = Number(decimal);
  if (!Number.isSafeInteger(value)) throw new RangeError("The occurrence identity integer is invalid.");
  return value.toString(36);
}

function parseBase36Integer(value: string, label: string): number {
  if (!BASE36_INTEGER_PATTERN.test(value)) {
    throw new RangeError(`The ${label} identity is invalid.`);
  }
  const parsed = Number.parseInt(value, 36);
  if (!Number.isSafeInteger(parsed) || parsed.toString(36) !== value) {
    throw new RangeError(`The ${label} identity is outside supported bounds.`);
  }
  return parsed;
}

function instantFromEpochMilliseconds(value: number): Temporal.Instant {
  try {
    return Temporal.Instant.fromEpochMilliseconds(value);
  } catch {
    throw new RangeError("The occurrence start is outside supported instant bounds.");
  }
}

function expandCompactTaskId(value: string): string {
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function encodeBase64Url(value: string): string {
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    throw new RangeError("The occurrence identity encoding is invalid.");
  }
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  let decoded: string;
  try {
    decoded = atob(value.replaceAll("-", "+").replaceAll("_", "/") + padding);
  } catch {
    throw new RangeError("The occurrence identity encoding is invalid.");
  }
  if (!/^[\x00-\x7F]+$/.test(decoded) || encodeBase64Url(decoded) !== value) {
    throw new RangeError("The occurrence identity encoding is invalid.");
  }
  return decoded;
}
