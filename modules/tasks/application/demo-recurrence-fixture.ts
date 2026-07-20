import { Temporal } from "temporal-polyfill";

import { createOccurrenceKey } from "../domain/recurrence/occurrence-key";
import { serializeRecurrenceRule } from "../domain/recurrence/recurrence-codec";
import { initialRecurrenceProjection } from "../domain/recurrence/recurrence-cutover-policy";
import type { RecurrenceScheduleAnchor } from "../domain/recurrence/recurrence-time-policy";
import type {
  DemoOccurrenceEventRecord,
  DemoRecurrenceRecord,
  DemoScheduleRecord,
} from "../infrastructure/demo-dataset-repository";

export const DEMO_RECURRING_TASK_ID = "50000000-0000-4000-8000-000000000011";
export const DEMO_RECURRING_TASK_VERSION = 3;

const firstEventId = "70000000-0000-4000-8000-000000000001";
const secondEventId = "70000000-0000-4000-8000-000000000002";
const timeZone = "UTC";

type DemoRecurrenceFixture = Readonly<{
  schedule: DemoScheduleRecord;
  recurrence: DemoRecurrenceRecord;
  occurrenceEvents: readonly DemoOccurrenceEventRecord[];
}>;

type TimedRecurrenceAnchor = Extract<RecurrenceScheduleAnchor, { kind: "timed" }>;

export function buildDemoRecurrenceFixture(resetAt: Date): DemoRecurrenceFixture {
  const today = Temporal.Instant.from(resetAt.toISOString()).toZonedDateTimeISO(timeZone).toPlainDate();
  const firstDate = today.subtract({ days: 2 });
  const secondDate = today.subtract({ days: 1 });
  const anchor = timedAnchor(firstDate, "09:00", "09:15");
  const projection = initialRecurrenceProjection(anchor);
  if (projection.kind !== "timed") throw new Error("The demo recurrence anchor must be timed.");

  return {
    schedule: {
      taskId: DEMO_RECURRING_TASK_ID,
      kind: "timed",
      startAt: new Date(anchor.startAt),
      endAt: new Date(anchor.endAt),
      timezone: anchor.timezone,
    },
    recurrence: {
      taskId: DEMO_RECURRING_TASK_ID,
      rrule: serializeRecurrenceRule(
        { preset: { kind: "daily", interval: 1 }, end: { kind: "never" } },
        anchor,
      ),
      timezone: anchor.timezone,
      generationMode: "schedule",
      projectionStartDate: null,
      projectionStartAt: new Date(projection.projectionStartAt),
      projectionEndDate: null,
      projectionEndAt: null,
    },
    occurrenceEvents: [
      occurrenceEvent(firstEventId, anchor.startAt, "completed", 2, resetAt),
      occurrenceEvent(
        secondEventId,
        timedAnchor(secondDate, "09:00", "09:15").startAt,
        "skipped",
        DEMO_RECURRING_TASK_VERSION,
        resetAt,
      ),
    ],
  };
}

function occurrenceEvent(
  id: string,
  startAt: string,
  state: DemoOccurrenceEventRecord["state"],
  taskVersion: number,
  effectiveAt: Date,
): DemoOccurrenceEventRecord {
  return {
    id,
    taskId: DEMO_RECURRING_TASK_ID,
    occurrenceKey: createOccurrenceKey(DEMO_RECURRING_TASK_ID, { kind: "timed", startAt }),
    state,
    taskVersion,
    effectiveAt,
  };
}

function timedAnchor(date: Temporal.PlainDate, startTime: string, endTime: string): TimedRecurrenceAnchor {
  return {
    kind: "timed",
    startAt: localInstant(date, startTime),
    endAt: localInstant(date, endTime),
    timezone: timeZone,
  };
}

function localInstant(date: Temporal.PlainDate, time: string): string {
  return date.toPlainDateTime(Temporal.PlainTime.from(time)).toZonedDateTime(timeZone).toInstant().toString();
}
