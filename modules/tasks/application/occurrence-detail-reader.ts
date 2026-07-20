import type { AuthenticatedActor } from "@/shared/auth/actor";
import {
  entityIdSchema,
  occurrenceKeySchema,
  occurrenceStateSchema,
  type TaskOccurrenceDto,
} from "./contracts";
import {
  createOccurrenceProjection,
  isEligibleOccurrence,
  projectRecordedOccurrence,
} from "./occurrence-projection-support";
import { parseStoredRecurrence } from "./recurrence-application-support";
import type { TaskReadSnapshot } from "./task-read-snapshot";
import { decodeOccurrenceKey } from "../domain/recurrence/occurrence-key";
import { createTaskOccurrenceEventRepository } from "../infrastructure/task-occurrence-event-repository";
import { createTaskRecurrenceRepository } from "../infrastructure/task-recurrence-repository";
import { createTaskScheduleRepository } from "../infrastructure/task-schedule-repository";
import { createTaskRepository } from "../infrastructure/task-repository";
import type { TaskScheduleTable } from "../infrastructure/schema";

export function createOccurrenceDetailReader(
  dependencies: Readonly<{
    snapshot: TaskReadSnapshot;
    taskSchedules: TaskScheduleTable;
  }>,
) {
  return async function readOccurrence(
    actor: AuthenticatedActor,
    rawTaskId: string,
    rawOccurrenceKey: string,
  ): Promise<TaskOccurrenceDto | null> {
    const taskId = entityIdSchema.safeParse(rawTaskId);
    const occurrenceKey = occurrenceKeySchema.safeParse(rawOccurrenceKey);
    if (!taskId.success || !occurrenceKey.success) return null;

    let decoded: ReturnType<typeof decodeOccurrenceKey>;
    try {
      decoded = decodeOccurrenceKey(occurrenceKey.data, taskId.data);
    } catch {
      return null;
    }

    return dependencies.snapshot.run(async (transaction) => {
      const tasks = createTaskRepository(transaction);
      const recurrences = createTaskRecurrenceRepository(transaction);
      const schedules = createTaskScheduleRepository(dependencies.taskSchedules, transaction);
      const events = createTaskOccurrenceEventRepository(transaction);

      // A transaction owns one pg client. Keep these reads sequential so the task version,
      // recurrence, schedule, and latest event all come from one repeatable-read snapshot.
      const task = await tasks.findById(actor.userId, taskId.data, "active");
      if (!task) return null;
      const recurrence = await recurrences.findByTaskId(actor.userId, taskId.data);
      if (!recurrence) return null;
      const schedule = await schedules.findByTaskId(actor.userId, taskId.data);
      if (!schedule) return null;
      const latest = await events.findLatest(actor.userId, taskId.data, occurrenceKey.data);
      if (latest && latest.taskVersion > task.version) {
        throw new Error("An occurrence event cannot be newer than its owning task.");
      }

      const parsed = parseStoredRecurrence(recurrence, schedule);
      const projectedSchedule = projectRecordedOccurrence(parsed.anchor, decoded);
      if (!projectedSchedule) return null;
      const transitionEligible =
        task.status === "open" &&
        task.deletedAt === null &&
        isEligibleOccurrence({
          rule: parsed.definition,
          anchor: parsed.anchor,
          projection: parsed.projection,
          decoded,
        });
      if (!latest && !transitionEligible) return null;

      return createOccurrenceProjection(
        task.id,
        task.version,
        projectedSchedule,
        latest ? occurrenceStateSchema.parse(latest.state) : "open",
        transitionEligible,
        recurrence.timezone,
        { kind: "recorded", occurrenceKey: occurrenceKey.data },
      ).occurrence;
    });
  };
}
