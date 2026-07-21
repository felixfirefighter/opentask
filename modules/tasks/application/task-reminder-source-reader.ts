import { Temporal } from "temporal-polyfill";

import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Database, DatabaseExecutor } from "@/shared/db/client";

import type {
  TaskReminderSource,
  TaskReminderSourceReader,
  TaskReminderSourceRead,
} from "./contracts/task-reminder-contract";
import { entityIdSchema } from "./contracts/contract-primitives";
import { nextFutureOccurrence, parseStoredRecurrence } from "./recurrence-application-support";
import type { RecurrenceExpansionPort } from "./recurrence-expansion-port";
import { createProjectedOccurrenceKey } from "../domain/recurrence/occurrence-key";
import type { RecurrenceOccurrenceSchedule } from "../domain/recurrence/recurrence-time-policy";
import { createTaskOccurrenceEventRepository } from "../infrastructure/task-occurrence-event-repository";
import { createTaskRecurrenceRepository } from "../infrastructure/task-recurrence-repository";
import { createTaskScheduleRepository } from "../infrastructure/task-schedule-repository";
import { createTaskRepository } from "../infrastructure/task-repository";
import type { TaskScheduleTable } from "../infrastructure/schema";

export function createTaskReminderSourceReader({
  database,
  taskSchedules,
  expansion,
}: Readonly<{
  database: Database;
  taskSchedules: TaskScheduleTable;
  expansion: RecurrenceExpansionPort;
}>): TaskReminderSourceReader {
  const tasks = createTaskRepository(database);
  const schedules = createTaskScheduleRepository(taskSchedules, database);
  const recurrences = createTaskRecurrenceRepository(database);
  const events = createTaskOccurrenceEventRepository(database);

  return {
    async readOwned(
      actor: AuthenticatedActor,
      rawInput: TaskReminderSourceRead,
      executor: DatabaseExecutor = database,
    ): Promise<TaskReminderSource | null> {
      const input = parseRead(rawInput);
      const task = input.lock
        ? await tasks.lockById(actor.userId, input.taskId, "any", executor)
        : await tasks.findById(actor.userId, input.taskId, "any", executor);
      if (!task) return null;

      const recurrence = input.lock
        ? await recurrences.lockByTaskId(actor.userId, input.taskId, executor)
        : await recurrences.findByTaskId(actor.userId, input.taskId, executor);
      const schedule = input.lock
        ? await schedules.lockByTaskId(actor.userId, input.taskId, executor)
        : await schedules.findByTaskId(actor.userId, input.taskId, executor);
      const recurring = recurrence !== null;

      return {
        taskId: task.id,
        status: parseTaskStatus(task.status),
        deleted: task.deletedAt !== null,
        recurring,
        relativeStart:
          task.status !== "open" || task.deletedAt !== null || schedule === null
            ? null
            : recurrence === null
              ? oneOffRelativeStart(schedule, input.relativeStartAfter)
              : await nextOpenRecurringStart({
                  actor,
                  taskId: task.id,
                  recurrence,
                  schedule,
                  relativeStartAfter: input.relativeStartAfter,
                  expansion,
                  events,
                  executor,
                }),
      };
    },
  };
}

function parseRead(input: TaskReminderSourceRead): TaskReminderSourceRead {
  const relativeStartAfter = new Date(input.relativeStartAfter);
  if (!Number.isFinite(relativeStartAfter.getTime())) {
    throw new RangeError("Reminder source cursor must be a valid instant.");
  }
  return {
    taskId: entityIdSchema.parse(input.taskId),
    relativeStartAfter,
    lock: input.lock === true,
  };
}

function oneOffRelativeStart(schedule: Readonly<{ kind: string; startAt: Date | null }>, after: Date) {
  if (schedule.kind !== "timed" || schedule.startAt === null || schedule.startAt <= after) return null;
  return { startAt: schedule.startAt, occurrenceKey: null } as const;
}

async function nextOpenRecurringStart({
  actor,
  taskId,
  recurrence,
  schedule,
  relativeStartAfter,
  expansion,
  events,
  executor,
}: Readonly<{
  actor: AuthenticatedActor;
  taskId: string;
  recurrence: Parameters<typeof parseStoredRecurrence>[0];
  schedule: Parameters<typeof parseStoredRecurrence>[1];
  relativeStartAfter: Date;
  expansion: RecurrenceExpansionPort;
  events: ReturnType<typeof createTaskOccurrenceEventRepository>;
  executor: DatabaseExecutor;
}>) {
  const parsed = parseStoredRecurrence(recurrence, schedule);
  let after = relativeStartAfter;

  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const next = nextFutureOccurrence(expansion, parsed.definition, parsed.anchor, parsed.projection, after);
    if (!next) return null;
    const occurrenceKey = createProjectedOccurrenceKey(
      taskId,
      occurrenceStart(next.schedule),
      next.candidate,
      next.schedule.timezone,
    );
    const startAt = scheduleStartInstant(next.schedule);
    const latest = await events.findLatest(actor.userId, taskId, occurrenceKey, executor);
    if (!latest || latest.state === "open") return { startAt, occurrenceKey } as const;
    after = startAt;
  }

  throw new RangeError("Reminder occurrence search exceeded its computation limit.");
}

function occurrenceStart(schedule: RecurrenceOccurrenceSchedule) {
  return schedule.kind === "all_day"
    ? ({ kind: "all_day", startDate: schedule.startDate } as const)
    : ({ kind: "timed", startAt: schedule.startAt } as const);
}

function scheduleStartInstant(schedule: RecurrenceOccurrenceSchedule): Date {
  const instant =
    schedule.kind === "all_day"
      ? Temporal.PlainDate.from(schedule.startDate)
          .toZonedDateTime({ timeZone: schedule.timezone, plainTime: "00:00" })
          .toInstant()
      : Temporal.Instant.from(schedule.startAt);
  return new Date(instant.epochMilliseconds);
}

function parseTaskStatus(status: string): TaskReminderSource["status"] {
  if (status === "open" || status === "completed" || status === "cancelled") return status;
  throw new Error("Stored task has an unsupported reminder status.");
}
