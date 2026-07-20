import type { DatabaseExecutor } from "@/shared/db/client";

import {
  createRecurrenceWrite,
  nextFutureOccurrenceStart,
  parseStoredRecurrence,
} from "./recurrence-application-support";
import type { RecurrenceExpansionPort } from "./recurrence-expansion-port";
import {
  fallbackEndCutover,
  restartRecurrenceProjection,
  type RecurrenceProjectionWindow,
} from "../domain/recurrence/recurrence-cutover-policy";
import type {
  createTaskRecurrenceRepository,
  StoredTaskRecurrence,
} from "../infrastructure/task-recurrence-repository";
import type { StoredTaskSchedule } from "../infrastructure/task-schedule-repository";

type RecurrenceRepository = Pick<ReturnType<typeof createTaskRecurrenceRepository>, "replace">;

export async function advanceDormantRecurrenceCutover(
  input: Readonly<{
    userId: string;
    recurrence: StoredTaskRecurrence;
    schedule: StoredTaskSchedule;
    now: Date;
    executor: DatabaseExecutor;
    expansion: RecurrenceExpansionPort;
    repository: RecurrenceRepository;
  }>,
): Promise<StoredTaskRecurrence> {
  const parsed = parseStoredRecurrence(input.recurrence, input.schedule);
  if (hasUpperCutover(parsed.projection)) return input.recurrence;

  const nextStart =
    nextFutureOccurrenceStart(
      input.expansion,
      parsed.definition,
      parsed.anchor,
      parsed.projection,
      input.now,
    ) ?? fallbackEndCutover(parsed.projection.kind, input.now.toISOString(), parsed.anchor.timezone);

  const restarted = restartRecurrenceProjection(parsed.projection, nextStart);
  if (sameProjection(parsed.projection, restarted)) return input.recurrence;
  const stored = await input.repository.replace(
    {
      userId: input.userId,
      taskId: input.recurrence.taskId,
      recurrence: createRecurrenceWrite(parsed.definition, parsed.anchor, restarted),
      now: input.now,
    },
    input.executor,
  );
  if (!stored) throw new Error("Dormant recurrence cutover update did not return the stored row.");
  return stored;
}

function hasUpperCutover(projection: RecurrenceProjectionWindow): boolean {
  return projection.kind === "all_day"
    ? projection.projectionEndDate !== null
    : projection.projectionEndAt !== null;
}

function sameProjection(left: RecurrenceProjectionWindow, right: RecurrenceProjectionWindow): boolean {
  if (left.kind === "all_day" && right.kind === "all_day") {
    return (
      left.projectionStartDate === right.projectionStartDate &&
      left.projectionEndDate === right.projectionEndDate
    );
  }
  return (
    left.kind === "timed" &&
    right.kind === "timed" &&
    left.projectionStartAt === right.projectionStartAt &&
    left.projectionEndAt === right.projectionEndAt
  );
}
