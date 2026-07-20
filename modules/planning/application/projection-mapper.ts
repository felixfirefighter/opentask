import {
  RECURRENCE_DRAG_DISABLED_REASON,
  RECURRENCE_MATRIX_EMPTY_SUMMARY,
  oneOffProjectionId,
  projectionScheduleSchema,
  recurrenceSummaryProjectionId,
  recurringOccurrenceProjectionId,
  type CalendarEventDto,
  type PlanningTaskRow,
} from "./projection-dto-contract";
import type {
  CanonicalPlanningTaskRow,
  PlanningBoundedOccurrenceProjection,
  PlanningOccurrenceSourcePage,
  PlanningTaskSourcePage,
} from "./planning-source-reader";
import type {
  OpenProjectionTask,
  ProjectionSchedule,
  ProjectionSourceTask,
  ScheduledProjectionTask,
} from "../domain/projections/projection-model";

export function mapCanonicalSourcePage(
  page: PlanningTaskSourcePage,
  input: Readonly<{ limit: number; schedulesRequired: boolean }>,
): readonly ProjectionSourceTask[] {
  assertSourceLength(page.items.length, input.limit, "planning task");

  const seen = new Set<string>();
  return page.items.map((row) => {
    if (seen.has(row.task.id)) {
      throw new Error("The planning source reader returned a duplicate task.");
    }
    seen.add(row.task.id);

    if (row.schedule !== null && row.schedule.taskId !== row.task.id) {
      throw new Error("The planning source reader returned a schedule for the wrong task.");
    }
    if (row.recurrenceRoot && row.schedule === null) {
      throw new Error("The planning source reader returned an unscheduled recurrence root.");
    }
    if (input.schedulesRequired && (row.schedule === null || row.recurrenceRoot)) {
      throw new Error("The planning source reader omitted a required one-off schedule.");
    }

    return mapCanonicalSourceRow(row);
  });
}

export function mapOccurrenceSourcePage(
  page: PlanningOccurrenceSourcePage,
  limit: number,
): readonly ProjectionSourceTask[] {
  assertSourceLength(page.items.length, limit, "planning occurrence");
  if (page.truncation.truncated !== page.truncation.reasons.length > 0) {
    throw new Error("The occurrence source returned inconsistent truncation metadata.");
  }

  const seen = new Set<string>();
  return page.items.map((item) => {
    const row = mapOccurrenceSourceRow(item);
    if (seen.has(row.projectionId)) {
      throw new Error("The occurrence source reader returned a duplicate projection identity.");
    }
    seen.add(row.projectionId);
    return row;
  });
}

export function toPlanningTaskRow(task: OpenProjectionTask): PlanningTaskRow {
  return {
    id: task.taskId,
    taskId: task.taskId,
    projectionId: task.projectionId,
    ...projectionMetadata(task),
    listId: task.listId,
    title: task.title,
    status: task.status,
    priority: task.priority,
    rank: task.rank,
    version: task.version,
    schedule: task.schedule,
  };
}

export function toCalendarEvent(task: ScheduledProjectionTask): CalendarEventDto {
  const common = {
    taskId: task.taskId,
    projectionId: task.projectionId,
    ...projectionMetadata(task),
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
  const common = mapTaskFields(row.task);
  if (row.recurrenceRoot) {
    return {
      ...common,
      projectionId: recurrenceSummaryProjectionId(row.task.id),
      projectionLifecycle: "recurrence_summary",
      recurrenceSummary: RECURRENCE_MATRIX_EMPTY_SUMMARY,
      schedule: null,
    };
  }

  return {
    ...common,
    projectionId: oneOffProjectionId(row.task.id),
    projectionLifecycle: "one_off",
    schedule: row.schedule === null ? null : mapSchedule(row.schedule),
  };
}

function mapOccurrenceSourceRow(item: PlanningBoundedOccurrenceProjection): ProjectionSourceTask {
  const common = mapTaskFields(item.task);
  if (item.projectionKind === "one_off") {
    if (item.schedule.taskId !== item.task.id) {
      throw new Error("The occurrence source returned a one-off schedule for the wrong task.");
    }
    return {
      ...common,
      projectionId: oneOffProjectionId(item.task.id),
      projectionLifecycle: "one_off",
      schedule: mapSchedule(item.schedule),
    };
  }

  if (item.occurrence.taskId !== item.task.id || item.occurrence.taskVersion !== item.task.version) {
    throw new Error("The occurrence source returned an occurrence for the wrong task version.");
  }
  return {
    ...common,
    projectionId: recurringOccurrenceProjectionId(item.task.id, item.occurrence.occurrenceKey),
    projectionLifecycle: "recurring_occurrence",
    occurrenceKey: item.occurrence.occurrenceKey,
    occurrenceState: item.occurrence.occurrenceState,
    schedule: mapSchedule(item.occurrence.schedule),
  };
}

function mapTaskFields(task: CanonicalPlanningTaskRow["task"]) {
  return {
    taskId: task.id,
    listId: task.listId,
    title: task.title,
    status: task.status,
    priority: task.priority,
    rank: task.rank,
    version: task.version,
    deletedAt: task.deletedAt,
  } as const;
}

function mapSchedule(
  schedule:
    | NonNullable<CanonicalPlanningTaskRow["schedule"]>
    | Extract<PlanningBoundedOccurrenceProjection, { projectionKind: "recurring" }>["occurrence"]["schedule"],
): ProjectionSchedule {
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

function projectionMetadata(task: ProjectionSourceTask) {
  if (task.projectionLifecycle === "one_off") {
    return {
      projectionLifecycle: task.projectionLifecycle,
      occurrenceKey: null,
      occurrenceState: null,
      recurrenceSummary: null,
      scheduleInteraction: {
        editScope: "task",
        dragEnabled: true,
        dragDisabledReason: null,
      },
    } as const;
  }
  if (task.projectionLifecycle === "recurring_occurrence") {
    return {
      projectionLifecycle: task.projectionLifecycle,
      occurrenceKey: task.occurrenceKey,
      occurrenceState: task.occurrenceState,
      recurrenceSummary: null,
      scheduleInteraction: {
        editScope: "series",
        dragEnabled: false,
        dragDisabledReason: RECURRENCE_DRAG_DISABLED_REASON,
      },
    } as const;
  }
  return {
    projectionLifecycle: task.projectionLifecycle,
    occurrenceKey: null,
    occurrenceState: null,
    recurrenceSummary: task.recurrenceSummary,
    scheduleInteraction: {
      editScope: "series",
      dragEnabled: false,
      dragDisabledReason: RECURRENCE_DRAG_DISABLED_REASON,
    },
  } as const;
}

function assertSourceLength(length: number, limit: number, label: string) {
  if (length > limit || length > 500) {
    throw new RangeError(`The ${label} source reader exceeded its requested row limit.`);
  }
}
