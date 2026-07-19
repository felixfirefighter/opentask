import {
  projectionScheduleSchema,
  type CalendarEventDto,
  type PlanningTaskRow,
} from "./projection-dto-contract";
import type { CanonicalPlanningTaskRow, PlanningTaskSourcePage } from "./planning-source-reader";
import type {
  OpenProjectionTask,
  ProjectionSchedule,
  ProjectionSourceTask,
  ScheduledOpenProjectionTask,
} from "../domain/projections/projection-model";

export function mapCanonicalSourcePage(
  page: PlanningTaskSourcePage,
  input: Readonly<{ limit: number; schedulesRequired: boolean }>,
): readonly ProjectionSourceTask[] {
  if (page.items.length > input.limit || page.items.length > 500) {
    throw new RangeError("The planning source reader exceeded its requested row limit.");
  }

  const seen = new Set<string>();
  return page.items.map((row) => {
    if (seen.has(row.task.id)) {
      throw new Error("The planning source reader returned a duplicate task.");
    }
    seen.add(row.task.id);

    if (row.schedule !== null && row.schedule.taskId !== row.task.id) {
      throw new Error("The planning source reader returned a schedule for the wrong task.");
    }
    if (input.schedulesRequired && row.schedule === null) {
      throw new Error("The planning source reader omitted a required schedule.");
    }

    return mapCanonicalSourceRow(row);
  });
}

export function toPlanningTaskRow(task: OpenProjectionTask): PlanningTaskRow {
  return {
    id: task.id,
    listId: task.listId,
    title: task.title,
    status: task.status,
    priority: task.priority,
    rank: task.rank,
    version: task.version,
    schedule: task.schedule,
  };
}

export function toCalendarEvent(task: ScheduledOpenProjectionTask): CalendarEventDto {
  const common = {
    taskId: task.id,
    listId: task.listId,
    title: task.title,
    status: task.status,
    priority: task.priority,
    version: task.version,
  } as const;

  return task.schedule.kind === "all_day"
    ? {
        ...common,
        kind: task.schedule.kind,
        startDate: task.schedule.startDate,
        endDate: task.schedule.endDate,
      }
    : {
        ...common,
        kind: task.schedule.kind,
        startAt: task.schedule.startAt,
        endAt: task.schedule.endAt,
        timezone: task.schedule.timezone,
      };
}

function mapCanonicalSourceRow(row: CanonicalPlanningTaskRow): ProjectionSourceTask {
  return {
    id: row.task.id,
    listId: row.task.listId,
    title: row.task.title,
    status: row.task.status,
    priority: row.task.priority,
    rank: row.task.rank,
    version: row.task.version,
    deletedAt: row.task.deletedAt,
    schedule: row.schedule === null ? null : mapSchedule(row.schedule),
  };
}

function mapSchedule(schedule: NonNullable<CanonicalPlanningTaskRow["schedule"]>): ProjectionSchedule {
  return projectionScheduleSchema.parse(
    schedule.kind === "all_day"
      ? {
          kind: schedule.kind,
          startDate: schedule.startDate,
          endDate: schedule.endDate,
        }
      : {
          kind: schedule.kind,
          startAt: schedule.startAt,
          endAt: schedule.endAt,
          timezone: schedule.timezone,
        },
  );
}
