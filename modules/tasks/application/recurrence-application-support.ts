import { Temporal } from "temporal-polyfill";

import type { AuthenticatedActor } from "@/shared/auth/actor";

import type { RecurrenceExpansionPort } from "./recurrence-expansion-port";
import {
  recurrenceDefinitionSchema,
  taskRecurrenceDtoSchema,
  type RecurrenceDefinition,
  type RecurrenceLifecycle,
  type TaskRecurrenceDto,
} from "./contracts/recurrence-contract";
import { parseRecurrenceRule, serializeRecurrenceRule } from "../domain/recurrence/recurrence-codec";
import { MAX_RECURRENCE_CANDIDATES_PER_SERIES } from "../domain/recurrence/recurrence-limits";
import {
  initialRecurrenceProjection,
  occurrenceStartsWithinProjection,
  type RecurrenceOccurrenceStart,
  type RecurrenceProjectionWindow,
} from "../domain/recurrence/recurrence-cutover-policy";
import type { LocalRecurrenceStart } from "../domain/recurrence/recurrence-time-policy";
import {
  projectRecurrenceCandidate,
  type RecurrenceOccurrenceSchedule,
  type RecurrenceScheduleAnchor,
} from "../domain/recurrence/recurrence-time-policy";
import type {
  RecurrenceCutoverWrite,
  RecurrenceWrite,
  StoredTaskRecurrence,
} from "../infrastructure/task-recurrence-repository";
import type { StoredTaskSchedule } from "../infrastructure/task-schedule-repository";
import type { StoredTask } from "../infrastructure/task-repository";

export type UserTimezoneResolver = (actor: AuthenticatedActor) => Promise<string>;

export type ParsedStoredRecurrence = Readonly<{
  anchor: RecurrenceScheduleAnchor;
  definition: RecurrenceDefinition;
  projection: RecurrenceProjectionWindow;
}>;

export function parseStoredRecurrence(
  recurrence: StoredTaskRecurrence,
  schedule: StoredTaskSchedule,
): ParsedStoredRecurrence {
  if (recurrence.generationMode !== "schedule") {
    throw new Error("Stored recurrence has an unsupported generation mode.");
  }
  const anchor = toRecurrenceAnchor(schedule, recurrence.timezone);
  return {
    anchor,
    definition: recurrenceDefinitionSchema.parse(parseRecurrenceRule(recurrence.rrule, anchor)),
    projection: storedProjection(recurrence),
  };
}

export function toRecurrenceAnchor(
  schedule: StoredTaskSchedule | RecurrenceScheduleInput,
  allDayTimezone: string,
): RecurrenceScheduleAnchor {
  if (schedule.kind === "all_day") {
    if (schedule.startDate === null || schedule.endDate === null) {
      throw new Error("Stored all-day schedule is incomplete.");
    }
    return {
      kind: "all_day",
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      timezone: allDayTimezone,
    };
  }
  if (
    schedule.kind !== "timed" ||
    schedule.startAt === null ||
    schedule.endAt === null ||
    schedule.timezone === null
  ) {
    throw new Error("Stored timed schedule is incomplete.");
  }
  if (allDayTimezone !== schedule.timezone) {
    throw new Error("Stored recurrence and timed schedule timezones do not match.");
  }
  return {
    kind: "timed",
    startAt: instantString(schedule.startAt),
    endAt: instantString(schedule.endAt),
    timezone: schedule.timezone,
  };
}

export function createRecurrenceWrite(
  definition: RecurrenceDefinition,
  anchor: RecurrenceScheduleAnchor,
  projection: RecurrenceProjectionWindow,
): RecurrenceWrite {
  return {
    rrule: serializeRecurrenceRule(definition, anchor),
    timezone: anchor.timezone,
    cutover: toCutoverWrite(projection),
  };
}

export function nextFutureOccurrenceStart(
  expansion: RecurrenceExpansionPort,
  definition: RecurrenceDefinition,
  anchor: RecurrenceScheduleAnchor,
  projection: RecurrenceProjectionWindow,
  now: Date,
): RecurrenceOccurrenceStart | null {
  const next = nextFutureOccurrence(expansion, definition, anchor, projection, now);
  return next === null ? null : occurrenceStart(next.schedule);
}

export function nextFutureOccurrence(
  expansion: RecurrenceExpansionPort,
  definition: RecurrenceDefinition,
  anchor: RecurrenceScheduleAnchor,
  projection: RecurrenceProjectionWindow,
  afterInstant: Date,
): Readonly<{
  candidate: LocalRecurrenceStart;
  schedule: RecurrenceOccurrenceSchedule;
}> | null {
  let after = futureSearchCursor(anchor, projection, afterInstant);
  for (let attempt = 0; attempt < MAX_RECURRENCE_CANDIDATES_PER_SERIES; attempt += 1) {
    const candidate = expansion.next({ rule: definition, anchor, after });
    if (candidate === null) return null;
    const schedule = projectRecurrenceCandidate(anchor, candidate);
    const start = occurrenceStart(schedule);
    if (isStrictlyFuture(start, afterInstant) && occurrenceStartsWithinProjection(projection, start)) {
      return { candidate, schedule };
    }
    if (isAtOrAfterUpperCutover(projection, start)) return null;
    after = candidate;
  }
  throw new RangeError("Future recurrence search exceeded its computation limit.");
}

export function mapTaskRecurrence(
  task: StoredTask,
  schedule: StoredTaskSchedule,
  recurrence: StoredTaskRecurrence,
  expansion: RecurrenceExpansionPort,
  now: Date,
): TaskRecurrenceDto {
  const parsed = parseStoredRecurrence(recurrence, schedule);
  const lifecycle = recurrenceLifecycle(task, parsed, expansion, now);
  return taskRecurrenceDtoSchema.parse({
    taskId: task.id,
    taskVersion: task.version,
    generationMode: recurrence.generationMode,
    timezone: recurrence.timezone,
    definition: parsed.definition,
    cutover: parsed.projection,
    lifecycle,
    createdAt: recurrence.createdAt.toISOString(),
    updatedAt: recurrence.updatedAt.toISOString(),
  });
}

export function occurrenceStart(schedule: RecurrenceOccurrenceSchedule): RecurrenceOccurrenceStart {
  return schedule.kind === "all_day"
    ? { kind: "all_day", startDate: schedule.startDate }
    : { kind: "timed", startAt: schedule.startAt };
}

export function storedProjection(recurrence: StoredTaskRecurrence): RecurrenceProjectionWindow {
  if (recurrence.projectionStartDate !== null) {
    if (recurrence.projectionStartAt !== null || recurrence.projectionEndAt !== null) {
      throw new Error("Stored recurrence mixes date and instant cutovers.");
    }
    return {
      kind: "all_day",
      projectionStartDate: recurrence.projectionStartDate,
      projectionEndDate: recurrence.projectionEndDate,
    };
  }
  if (
    recurrence.projectionStartAt === null ||
    recurrence.projectionEndDate !== null ||
    recurrence.projectionStartDate !== null
  ) {
    throw new Error("Stored recurrence has an invalid cutover shape.");
  }
  return {
    kind: "timed",
    projectionStartAt: recurrence.projectionStartAt.toISOString(),
    projectionEndAt: recurrence.projectionEndAt?.toISOString() ?? null,
  };
}

export function initialProjection(anchor: RecurrenceScheduleAnchor): RecurrenceProjectionWindow {
  return initialRecurrenceProjection(anchor);
}

type RecurrenceScheduleInput =
  | Readonly<{
      kind: "all_day";
      startDate: string;
      endDate: string;
      startAt?: never;
      endAt?: never;
      timezone?: never;
    }>
  | Readonly<{
      kind: "timed";
      startDate?: never;
      endDate?: never;
      startAt: string;
      endAt: string;
      timezone: string;
    }>;

function toCutoverWrite(projection: RecurrenceProjectionWindow): RecurrenceCutoverWrite {
  return projection.kind === "all_day"
    ? projection
    : {
        kind: "timed",
        projectionStartAt: new Date(projection.projectionStartAt),
        projectionEndAt: projection.projectionEndAt === null ? null : new Date(projection.projectionEndAt),
      };
}

function recurrenceLifecycle(
  task: StoredTask,
  parsed: ParsedStoredRecurrence,
  expansion: RecurrenceExpansionPort,
  now: Date,
): RecurrenceLifecycle {
  const upper =
    parsed.projection.kind === "all_day"
      ? parsed.projection.projectionEndDate
      : parsed.projection.projectionEndAt;
  if (upper !== null) return "ended";
  if (task.deletedAt !== null || task.status === "cancelled") return "dormant";
  if (task.status !== "open") {
    throw new Error("A completed task cannot retain an active recurrence.");
  }
  return nextFutureOccurrenceStart(expansion, parsed.definition, parsed.anchor, parsed.projection, now) ===
    null
    ? "exhausted"
    : "active";
}

function futureSearchCursor(
  anchor: RecurrenceScheduleAnchor,
  projection: RecurrenceProjectionWindow,
  now: Date,
): LocalRecurrenceStart {
  const nowInstant = Temporal.Instant.from(now.toISOString());
  if (anchor.kind === "all_day" && projection.kind === "all_day") {
    const today = nowInstant.toZonedDateTimeISO(anchor.timezone).toPlainDate();
    const beforeLower = Temporal.PlainDate.from(projection.projectionStartDate).subtract({ days: 1 });
    return {
      kind: "all_day",
      startDate:
        Temporal.PlainDate.compare(today, beforeLower) >= 0 ? today.toString() : beforeLower.toString(),
    };
  }
  if (anchor.kind !== "timed" || projection.kind !== "timed") {
    throw new Error("Recurrence schedule and cutover kinds do not match.");
  }
  const nowLocal = floorToMinute(nowInstant.toZonedDateTimeISO(anchor.timezone).toPlainDateTime());
  const beforeLower = Temporal.Instant.from(projection.projectionStartAt)
    .toZonedDateTimeISO(anchor.timezone)
    .toPlainDateTime()
    .subtract({ minutes: 1 });
  return {
    kind: "timed",
    startLocalDateTime:
      Temporal.PlainDateTime.compare(nowLocal, beforeLower) >= 0
        ? minuteString(nowLocal)
        : minuteString(beforeLower),
  };
}

function isStrictlyFuture(start: RecurrenceOccurrenceStart, now: Date): boolean {
  return start.kind === "all_day" || Temporal.Instant.compare(start.startAt, now.toISOString()) > 0;
}

function isAtOrAfterUpperCutover(
  projection: RecurrenceProjectionWindow,
  start: RecurrenceOccurrenceStart,
): boolean {
  if (projection.kind === "all_day" && start.kind === "all_day") {
    return projection.projectionEndDate !== null && start.startDate >= projection.projectionEndDate;
  }
  return (
    projection.kind === "timed" &&
    start.kind === "timed" &&
    projection.projectionEndAt !== null &&
    Temporal.Instant.compare(start.startAt, projection.projectionEndAt) >= 0
  );
}

function floorToMinute(value: Temporal.PlainDateTime): Temporal.PlainDateTime {
  return value.with({ second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 });
}

function minuteString(value: Temporal.PlainDateTime): string {
  return value.toString({ smallestUnit: "minute" });
}

function instantString(value: string | Date): string {
  return typeof value === "string" ? Temporal.Instant.from(value).toString() : value.toISOString();
}
