import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Clock } from "@/shared/time/clock";
import { ianaTimeZoneSchema } from "@/shared/validation/time-zone";

import {
  agendaProjectionSchema,
  calendarProjectionSchema,
  eisenhowerProjectionSchema,
  todayProjectionSchema,
  upcomingProjectionSchema,
  type AgendaProjection,
  type CalendarProjection,
  type EisenhowerProjection,
  type TodayProjection,
  type UpcomingProjection,
} from "./projection-dto-contract";
import {
  mapCanonicalSourcePage,
  mapOccurrenceSourcePage,
  toCalendarEvent,
  toPlanningTaskRow,
} from "./projection-mapper";
import {
  planningRangeQuerySchema,
  projectionLimitQuerySchema,
  smartDestinationSchema,
} from "./projection-query-contract";
import type {
  PlanningOccurrenceRangeQuery,
  PlanningOccurrenceSourceReader,
  PlanningTaskSourceReader,
  PlanningTimeZoneReader,
} from "./planning-source-reader";
import { projectAgendaTasks, projectCalendarTasks } from "../domain/projections/calendar-policy";
import { projectEisenhower } from "../domain/projections/eisenhower-policy";
import {
  addLocalDays,
  buildLocalRange,
  formatInstant,
  localDateForInstant,
} from "../domain/projections/local-time-policy";
import { selectMatrixRecurrenceRows } from "../domain/projections/matrix-recurrence-policy";
import { projectToday } from "../domain/projections/today-policy";
import { projectUpcoming } from "../domain/projections/upcoming-policy";

const RECURRENCE_MAX_DURATION_DAYS = 31;
const MATRIX_FORWARD_DAYS = 62;

type PlanningProjectionDependencies = Readonly<{
  tasks: PlanningTaskSourceReader;
  occurrences: PlanningOccurrenceSourceReader;
  timeZones: PlanningTimeZoneReader;
  clock: Clock;
}>;

export function createPlanningProjectionApplication(dependencies: PlanningProjectionDependencies) {
  async function getToday(actor: AuthenticatedActor, rawQuery: unknown = {}): Promise<TodayProjection> {
    const query = projectionLimitQuerySchema.parse(rawQuery);
    const context = await loadTimeContext(actor, dependencies);
    const dayRange = buildLocalRange(context.localDate, addLocalDays(context.localDate, 1), context.timeZone);
    const [oneOffPage, occurrencePage] = await Promise.all([
      dependencies.tasks.readOpenTasks(actor, {
        kind: "scheduled_through",
        exclusiveEndDate: dayRange.endDate,
        exclusiveEndAt: dayRange.endAt,
        limit: query.limit,
      }),
      dependencies.occurrences.readBoundedOccurrences(
        actor,
        toOccurrenceRangeReadQuery(dayRange, query.limit),
      ),
    ]);
    const rows = [
      ...mapCanonicalSourcePage(oneOffPage, { limit: query.limit, schedulesRequired: true }),
      ...mapOccurrenceSourcePage(occurrencePage, query.limit).filter(
        (row) => row.projectionLifecycle === "recurring_occurrence",
      ),
    ];
    const capped = capToday(projectToday(rows, context), query.limit);

    return todayProjectionSchema.parse({
      ...context,
      overdue: capped.overdue.map(toPlanningTaskRow),
      timed: capped.timed.map(toPlanningTaskRow),
      anytime: capped.anytime.map(toPlanningTaskRow),
      remainingCount: capped.total,
      truncated: oneOffPage.truncated || occurrencePage.truncation.truncated || capped.outputTruncated,
    });
  }

  async function getUpcoming(actor: AuthenticatedActor, rawQuery: unknown = {}): Promise<UpcomingProjection> {
    const query = projectionLimitQuerySchema.parse(rawQuery);
    const context = await loadTimeContext(actor, dependencies);
    const range = buildLocalRange(context.localDate, addLocalDays(context.localDate, 7), context.timeZone);
    const page = await dependencies.occurrences.readBoundedOccurrences(
      actor,
      toOccurrenceRangeReadQuery(range, query.limit),
    );
    const rows = mapOccurrenceSourcePage(page, query.limit);
    const capped = capUpcoming(projectUpcoming(rows, { range, ...context }), query.limit);
    const days = capped.days.map((day) => ({
      localDate: day.localDate,
      items: day.tasks.map(toPlanningTaskRow),
    }));

    return upcomingProjectionSchema.parse({
      rangeStartDate: range.startDate,
      rangeEndDate: range.endDate,
      timeZone: context.timeZone,
      nowAt: context.nowAt,
      days,
      remainingCount: capped.total,
      truncated: page.truncation.truncated || capped.outputTruncated,
    });
  }

  async function getSmartDestination(
    actor: AuthenticatedActor,
    rawDestination: unknown,
    rawQuery: unknown = {},
  ): Promise<TodayProjection | UpcomingProjection> {
    const destination = smartDestinationSchema.parse(rawDestination);
    return destination === "today" ? getToday(actor, rawQuery) : getUpcoming(actor, rawQuery);
  }

  async function getCalendarRange(actor: AuthenticatedActor, rawQuery: unknown): Promise<CalendarProjection> {
    const loaded = await loadRange(actor, rawQuery, dependencies);
    return calendarProjectionSchema.parse({
      ...toRangeDto(loaded.range),
      timeZone: loaded.context.timeZone,
      events: projectCalendarTasks(loaded.rows, loaded.range).map(toCalendarEvent),
      truncated: loaded.truncated,
    });
  }

  async function getAgendaRange(actor: AuthenticatedActor, rawQuery: unknown): Promise<AgendaProjection> {
    const loaded = await loadRange(actor, rawQuery, dependencies);
    return agendaProjectionSchema.parse({
      ...toRangeDto(loaded.range),
      timeZone: loaded.context.timeZone,
      items: projectAgendaTasks(loaded.rows, loaded.range, loaded.context.timeZone).map((row) => ({
        groupDate: row.groupDate,
        event: toCalendarEvent(row.task),
      })),
      truncated: loaded.truncated,
    });
  }

  async function getEisenhower(
    actor: AuthenticatedActor,
    rawQuery: unknown = {},
  ): Promise<EisenhowerProjection> {
    const query = projectionLimitQuerySchema.parse(rawQuery);
    const context = await loadTimeContext(actor, dependencies);
    const overlapRange = buildLocalRange(
      addLocalDays(context.localDate, -RECURRENCE_MAX_DURATION_DAYS),
      context.localDate,
      context.timeZone,
    );
    const forwardRange = buildLocalRange(
      context.localDate,
      addLocalDays(context.localDate, MATRIX_FORWARD_DAYS),
      context.timeZone,
    );
    const [allOpenPage, overlapPage, forwardPage] = await Promise.all([
      dependencies.tasks.readOpenTasks(actor, { kind: "all_open", limit: query.limit }),
      dependencies.occurrences.readBoundedOccurrences(
        actor,
        toOccurrenceRangeReadQuery(overlapRange, query.limit),
      ),
      dependencies.occurrences.readBoundedOccurrences(
        actor,
        toOccurrenceRangeReadQuery(forwardRange, query.limit),
      ),
    ]);
    const allOpenRows = mapCanonicalSourcePage(allOpenPage, {
      limit: query.limit,
      schedulesRequired: false,
    });
    const overlapRows = mapOccurrenceSourcePage(overlapPage, query.limit);
    const forwardRows = mapOccurrenceSourcePage(forwardPage, query.limit);
    const rows = selectMatrixRecurrenceRows(allOpenRows, overlapRows, forwardRows, {
      todayStartAt: forwardRange.startAt,
      timeZone: context.timeZone,
    });
    const projection = projectEisenhower(rows, context);

    return eisenhowerProjectionSchema.parse({
      timeZone: context.timeZone,
      nowAt: context.nowAt,
      urgentThroughAt: formatInstant(projection.urgentThrough),
      doNow: projection.doNow.map(toPlanningTaskRow),
      plan: projection.plan.map(toPlanningTaskRow),
      timeSensitive: projection.timeSensitive.map(toPlanningTaskRow),
      later: projection.later.map(toPlanningTaskRow),
      truncated:
        allOpenPage.truncated || overlapPage.truncation.truncated || forwardPage.truncation.truncated,
    });
  }

  return {
    getSmartDestination,
    getToday,
    getUpcoming,
    getCalendarRange,
    getAgendaRange,
    getEisenhower,
  } as const;
}

export type PlanningProjectionApplication = ReturnType<typeof createPlanningProjectionApplication>;

async function loadRange(
  actor: AuthenticatedActor,
  rawQuery: unknown,
  dependencies: PlanningProjectionDependencies,
) {
  const query = planningRangeQuerySchema.parse(rawQuery);
  const context = await loadTimeContext(actor, dependencies);
  const range = buildLocalRange(query.rangeStartDate, query.rangeEndDate, context.timeZone);
  const page = await dependencies.occurrences.readBoundedOccurrences(
    actor,
    toOccurrenceRangeReadQuery(range, query.limit),
  );
  return {
    context,
    range,
    rows: mapOccurrenceSourcePage(page, query.limit),
    truncated: page.truncation.truncated,
  };
}

async function loadTimeContext(actor: AuthenticatedActor, dependencies: PlanningProjectionDependencies) {
  const timeZone = ianaTimeZoneSchema.parse(await dependencies.timeZones.getSavedTimeZone(actor));
  const nowAt = dependencies.clock.now().toISOString();
  return {
    localDate: localDateForInstant(nowAt, timeZone),
    timeZone,
    nowAt,
  } as const;
}

function toOccurrenceRangeReadQuery(
  range: ReturnType<typeof buildLocalRange>,
  limit: number,
): PlanningOccurrenceRangeQuery {
  return {
    rangeStartDate: range.startDate,
    rangeEndDate: range.endDate,
    rangeStartAt: range.startAt,
    rangeEndAt: range.endAt,
    limit,
  };
}

function toRangeDto(range: ReturnType<typeof buildLocalRange>) {
  return {
    rangeStartDate: range.startDate,
    rangeEndDate: range.endDate,
    rangeStartAt: range.startAt,
    rangeEndAt: range.endAt,
  } as const;
}

function capToday(projection: ReturnType<typeof projectToday>, limit: number) {
  let remaining = limit;
  const overdue = projection.overdue.slice(0, remaining);
  remaining -= overdue.length;
  const timed = projection.timed.slice(0, remaining);
  remaining -= timed.length;
  const anytime = projection.anytime.slice(0, remaining);
  const total = overdue.length + timed.length + anytime.length;
  return {
    overdue,
    timed,
    anytime,
    total,
    outputTruncated: projection.overdue.length + projection.timed.length + projection.anytime.length > total,
  };
}

function capUpcoming(
  days: ReturnType<typeof projectUpcoming>,
  limit: number,
): Readonly<{
  days: ReturnType<typeof projectUpcoming>;
  total: number;
  outputTruncated: boolean;
}> {
  let remaining = limit;
  const cappedDays = days.map((day) => {
    const tasks = day.tasks.slice(0, remaining);
    remaining -= tasks.length;
    return { ...day, tasks };
  });
  const sourceTotal = days.reduce((total, day) => total + day.tasks.length, 0);
  const total = cappedDays.reduce((count, day) => count + day.tasks.length, 0);
  return { days: cappedDays, total, outputTruncated: sourceTotal > total };
}
