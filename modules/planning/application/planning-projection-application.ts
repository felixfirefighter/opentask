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
import { mapCanonicalSourcePage, toCalendarEvent, toPlanningTaskRow } from "./projection-mapper";
import {
  planningRangeQuerySchema,
  projectionLimitQuerySchema,
  smartDestinationSchema,
} from "./projection-query-contract";
import type { PlanningTaskSourceReader, PlanningTimeZoneReader } from "./planning-source-reader";
import { projectAgendaTasks, projectCalendarTasks } from "../domain/projections/calendar-policy";
import { projectEisenhower } from "../domain/projections/eisenhower-policy";
import {
  addLocalDays,
  buildLocalRange,
  formatInstant,
  localDateForInstant,
} from "../domain/projections/local-time-policy";
import { projectToday } from "../domain/projections/today-policy";
import { projectUpcoming } from "../domain/projections/upcoming-policy";

type PlanningProjectionDependencies = Readonly<{
  tasks: PlanningTaskSourceReader;
  timeZones: PlanningTimeZoneReader;
  clock: Clock;
}>;

export function createPlanningProjectionApplication(dependencies: PlanningProjectionDependencies) {
  async function getToday(actor: AuthenticatedActor, rawQuery: unknown = {}): Promise<TodayProjection> {
    const query = projectionLimitQuerySchema.parse(rawQuery);
    const context = await loadTimeContext(actor, dependencies);
    const endDate = addLocalDays(context.localDate, 1);
    const range = buildLocalRange(context.localDate, endDate, context.timeZone);
    const page = await dependencies.tasks.readOpenTasks(actor, {
      kind: "scheduled_through",
      exclusiveEndDate: endDate,
      exclusiveEndAt: range.endAt,
      limit: query.limit,
    });
    const rows = mapCanonicalSourcePage(page, { limit: query.limit, schedulesRequired: true });
    const projection = projectToday(rows, context);
    const overdue = projection.overdue.map(toPlanningTaskRow);
    const timed = projection.timed.map(toPlanningTaskRow);
    const anytime = projection.anytime.map(toPlanningTaskRow);

    return todayProjectionSchema.parse({
      ...context,
      overdue,
      timed,
      anytime,
      remainingCount: overdue.length + timed.length + anytime.length,
      truncated: page.truncated,
    });
  }

  async function getUpcoming(actor: AuthenticatedActor, rawQuery: unknown = {}): Promise<UpcomingProjection> {
    const query = projectionLimitQuerySchema.parse(rawQuery);
    const context = await loadTimeContext(actor, dependencies);
    const range = buildLocalRange(context.localDate, addLocalDays(context.localDate, 7), context.timeZone);
    const page = await dependencies.tasks.readOpenTasks(actor, toRangeReadQuery(range, query.limit));
    const rows = mapCanonicalSourcePage(page, { limit: query.limit, schedulesRequired: true });
    const days = projectUpcoming(rows, { range, ...context }).map((day) => ({
      localDate: day.localDate,
      items: day.tasks.map(toPlanningTaskRow),
    }));

    return upcomingProjectionSchema.parse({
      rangeStartDate: range.startDate,
      rangeEndDate: range.endDate,
      timeZone: context.timeZone,
      nowAt: context.nowAt,
      days,
      remainingCount: days.reduce((total, day) => total + day.items.length, 0),
      truncated: page.truncated,
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
    const page = await dependencies.tasks.readOpenTasks(actor, {
      kind: "all_open",
      limit: query.limit,
    });
    const rows = mapCanonicalSourcePage(page, { limit: query.limit, schedulesRequired: false });
    const projection = projectEisenhower(rows, context);

    return eisenhowerProjectionSchema.parse({
      timeZone: context.timeZone,
      nowAt: context.nowAt,
      urgentThroughAt: formatInstant(projection.urgentThrough),
      doNow: projection.doNow.map(toPlanningTaskRow),
      plan: projection.plan.map(toPlanningTaskRow),
      timeSensitive: projection.timeSensitive.map(toPlanningTaskRow),
      later: projection.later.map(toPlanningTaskRow),
      truncated: page.truncated,
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
  const page = await dependencies.tasks.readOpenTasks(actor, toRangeReadQuery(range, query.limit));
  return {
    context,
    range,
    rows: mapCanonicalSourcePage(page, { limit: query.limit, schedulesRequired: true }),
    truncated: page.truncated,
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

function toRangeReadQuery(
  range: ReturnType<typeof buildLocalRange>,
  limit: number,
): Parameters<PlanningTaskSourceReader["readOpenTasks"]>[1] {
  return {
    kind: "scheduled_range",
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
