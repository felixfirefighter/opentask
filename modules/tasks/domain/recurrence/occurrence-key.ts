import { Temporal } from "temporal-polyfill";

import type { RecurrenceOccurrenceStart } from "./recurrence-cutover-policy";
import { assertCanonicalLocalDate } from "./recurrence-policy";

export const OCCURRENCE_KEY_MAX_LENGTH = 80;
const OCCURRENCE_KEY_PREFIX = "o1.";
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type DecodedOccurrenceKey =
  | Readonly<{ taskId: string; kind: "all_day"; startDate: string }>
  | Readonly<{
      taskId: string;
      kind: "timed";
      epochMilliseconds: number;
      startAt: string;
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

export function decodeOccurrenceKey(key: string, expectedTaskId?: string): DecodedOccurrenceKey {
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
    startAt = Temporal.Instant.fromEpochMilliseconds(epochMilliseconds).toString();
  } catch {
    throw new RangeError("The occurrence start is outside supported instant bounds.");
  }
  return { taskId, kind: "timed", epochMilliseconds, startAt };
}

function canonicalTaskId(taskId: string): string {
  const canonical = taskId.toLowerCase();
  if (!UUID_V4_PATTERN.test(canonical))
    throw new RangeError("Occurrence identity requires a UUIDv4 task ID.");
  return canonical;
}

function canonicalDate(value: string): string {
  assertCanonicalLocalDate(value, "Occurrence start date");
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
  return (instant.epochNanoseconds / 1_000_000n).toString();
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
