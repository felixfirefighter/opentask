import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { DatabaseExecutor } from "@/shared/db/client";

import {
  boundedTaskOccurrencePageSchema,
  OCCURRENCE_EVENT_SOURCE_LIMIT,
  occurrenceStateSchema,
  RECURRENCE_CANDIDATE_LIMIT_PER_REQUEST,
  RECURRENCE_CANDIDATE_LIMIT_PER_SERIES,
  RECURRENCE_SOURCE_LIMIT,
  taskOccurrenceRangeQuerySchema,
  type BoundedTaskOccurrencePage,
  type BoundedTaskProjection,
  type OccurrenceState,
  type OccurrenceTruncation,
  type TaskOccurrenceRangeQuery,
} from "./contracts/occurrence-contract";
import { selectPotentiallyOverlappingHistoricalEvents } from "./occurrence-history-selection";
import {
  createOccurrenceProjection,
  expandOccurrenceSchedules,
  isEligibleOccurrence,
  occurrenceOverlapsRange,
  projectRecordedOccurrence,
  scheduleSortStart,
  type OccurrenceProjectionIdentity,
} from "./occurrence-projection-support";
import { parseStoredRecurrence, type UserTimezoneResolver } from "./recurrence-application-support";
import type { RecurrenceExpansionPort } from "./recurrence-expansion-port";
import { mapSchedule } from "./schedule-application";
import { mapTask } from "./task-application-support";
import type { RecurrenceOccurrenceSchedule } from "../domain/recurrence/recurrence-time-policy";
import { createTaskOccurrenceEventRepository } from "../infrastructure/task-occurrence-event-repository";
import {
  createTaskRecurrenceRepository,
  type StoredTaskRecurrenceSource,
} from "../infrastructure/task-recurrence-repository";
import {
  createTaskScheduleRepository,
  type StoredScheduledTask,
  type StoredTaskSchedule,
} from "../infrastructure/task-schedule-repository";
import type { TaskScheduleTable } from "../infrastructure/schema";

type SortableProjection = Readonly<{
  item: BoundedTaskProjection;
  sortStart: bigint;
  taskId: string;
  occurrenceKey: string;
}>;

export function createBoundedOccurrenceReader(
  dependencies: Readonly<{
    database: DatabaseExecutor;
    taskSchedules: TaskScheduleTable;
    expansion: RecurrenceExpansionPort;
    resolveUserTimezone: UserTimezoneResolver;
    serializeSourceReads?: boolean;
  }>,
) {
  const schedules = createTaskScheduleRepository(dependencies.taskSchedules, dependencies.database);
  const recurrences = createTaskRecurrenceRepository(dependencies.database);
  const events = createTaskOccurrenceEventRepository(dependencies.database);

  return async function readBoundedOccurrences(
    actor: AuthenticatedActor,
    rawQuery: TaskOccurrenceRangeQuery,
  ): Promise<BoundedTaskOccurrencePage> {
    const query = taskOccurrenceRangeQuerySchema.parse(rawQuery);
    const range = repositoryRange(query);

    async function loadSourcesSequentially() {
      const oneOffPage = await schedules.listActiveOpenOneOffsInRange(actor.userId, range);
      const recurrencePage = await recurrences.listActiveOpenSourcesInRange(
        actor.userId,
        range,
        dependencies.database,
        { serializeReads: true },
      );
      const eventPage = await events.listLatestForUser(actor.userId, OCCURRENCE_EVENT_SOURCE_LIMIT);
      const userTimezone = await dependencies.resolveUserTimezone(actor, dependencies.database);
      return [oneOffPage, recurrencePage, eventPage, userTimezone] as const;
    }

    const [oneOffPage, recurrencePage, eventPage, userTimezone] = dependencies.serializeSourceReads
      ? await loadSourcesSequentially()
      : await Promise.all([
          schedules.listActiveOpenOneOffsInRange(actor.userId, range),
          recurrences.listActiveOpenSourcesInRange(actor.userId, range),
          events.listLatestForUser(actor.userId, OCCURRENCE_EVENT_SOURCE_LIMIT),
          dependencies.resolveUserTimezone(actor, dependencies.database),
        ]);
    const historicalEvents = selectPotentiallyOverlappingHistoricalEvents(eventPage.items, query);
    const currentSourceTaskIds = new Set(recurrencePage.items.map(({ task }) => task.id));
    const historicalTaskIds = [
      ...new Set(
        historicalEvents.flatMap(({ event }) =>
          currentSourceTaskIds.has(event.taskId) ? [] : [event.taskId],
        ),
      ),
    ].sort();
    const historicalSourcePage =
      historicalTaskIds.length === 0
        ? { items: [], truncated: false }
        : await recurrences.listActiveOpenSourcesForTaskIds(
            actor.userId,
            historicalTaskIds,
            RECURRENCE_SOURCE_LIMIT,
          );
    const recurrenceSources = mergeRecurrenceSources(recurrencePage.items, historicalSourcePage.items);
    const reasons = new Set<OccurrenceTruncation["reasons"][number]>();
    if (
      oneOffPage.truncated ||
      recurrencePage.truncated ||
      historicalSourcePage.truncated ||
      recurrenceSources.truncated
    ) {
      reasons.add("source_limit");
    }
    if (eventPage.truncated) reasons.add("event_source_limit");

    const projections = new Map<string, SortableProjection>();
    for (const source of oneOffPage.items) {
      const projection = projectOneOff(source, userTimezone);
      projections.set(projectionIdentity(projection), projection);
    }

    const latestEvents = new Map(
      historicalEvents.map(({ event }) => [
        eventIdentity(event.taskId, event.occurrenceKey),
        occurrenceStateSchema.parse(event.state),
      ]),
    );
    let candidateEvaluations = 0;
    for (const [index, source] of recurrencePage.items.entries()) {
      const remaining = RECURRENCE_CANDIDATE_LIMIT_PER_REQUEST - candidateEvaluations;
      if (remaining === 0) {
        reasons.add("request_candidate_limit");
        break;
      }
      const candidateLimit = Math.min(RECURRENCE_CANDIDATE_LIMIT_PER_SERIES, remaining);
      const parsed = parseStoredRecurrence(source.recurrence, source.schedule);
      const expanded = expandOccurrenceSchedules({
        expansion: dependencies.expansion,
        rule: parsed.definition,
        anchor: parsed.anchor,
        projection: parsed.projection,
        query,
        candidateLimit,
      });
      candidateEvaluations += expanded.evaluated;
      if (expanded.truncated) {
        reasons.add(
          candidateLimit === RECURRENCE_CANDIDATE_LIMIT_PER_SERIES
            ? "series_candidate_limit"
            : "request_candidate_limit",
        );
      }
      for (const { candidate, schedule } of expanded.schedules) {
        const identity = { kind: "generated", candidate } as const satisfies OccurrenceProjectionIdentity;
        const key = createOccurrenceProjection(
          source.task.id,
          source.task.version,
          schedule,
          "open",
          true,
          userTimezone,
          identity,
        ).occurrence.occurrenceKey;
        addRecurringProjection(
          projections,
          source,
          schedule,
          latestEvents.get(eventIdentity(source.task.id, key)) ?? "open",
          true,
          userTimezone,
          identity,
        );
      }
      if (
        candidateEvaluations === RECURRENCE_CANDIDATE_LIMIT_PER_REQUEST &&
        (expanded.truncated || index < recurrencePage.items.length - 1)
      ) {
        reasons.add("request_candidate_limit");
        break;
      }
    }

    const recurrenceByTask = new Map(recurrenceSources.items.map((source) => [source.task.id, source]));
    for (const { event, decoded } of historicalEvents) {
      const source = recurrenceByTask.get(event.taskId);
      if (!source) continue;
      if (event.taskVersion > source.task.version) {
        throw new Error("An occurrence event cannot be newer than its owning task.");
      }
      const parsed = parseStoredRecurrence(source.recurrence, source.schedule);
      const schedule = projectRecordedOccurrence(parsed.anchor, decoded);
      if (!schedule || !occurrenceOverlapsRange(schedule, query)) continue;
      const transitionEligible =
        source.task.status === "open" &&
        source.task.deletedAt === null &&
        isEligibleOccurrence({
          rule: parsed.definition,
          anchor: parsed.anchor,
          projection: parsed.projection,
          decoded,
        });
      addRecurringProjection(
        projections,
        source,
        schedule,
        occurrenceStateSchema.parse(event.state),
        transitionEligible,
        userTimezone,
        { kind: "recorded", occurrenceKey: event.occurrenceKey },
      );
    }

    const ordered = [...projections.values()].sort(compareProjection);
    if (ordered.length > query.limit) reasons.add("output_limit");
    return boundedTaskOccurrencePageSchema.parse({
      items: ordered.slice(0, query.limit).map(({ item }) => item),
      truncation: {
        truncated: reasons.size > 0,
        reasons: orderedReasons(reasons),
        recurrenceRowsEvaluated: recurrenceSources.items.length,
        occurrenceEventsEvaluated: eventPage.items.length,
        candidateEvaluations,
      },
    });
  };
}

function mergeRecurrenceSources(
  current: readonly StoredTaskRecurrenceSource[],
  historical: readonly StoredTaskRecurrenceSource[],
) {
  const currentIds = new Set(current.map(({ task }) => task.id));
  const historicalOnly = historical.filter(({ task }) => !currentIds.has(task.id));
  const available = Math.max(0, RECURRENCE_SOURCE_LIMIT - current.length);
  return {
    items: [...current, ...historicalOnly.slice(0, available)],
    truncated: historicalOnly.length > available,
  } as const;
}

function addRecurringProjection(
  projections: Map<string, SortableProjection>,
  source: StoredTaskRecurrenceSource,
  schedule: RecurrenceOccurrenceSchedule,
  state: OccurrenceState,
  transitionEligible: boolean,
  userTimezone: string,
  identity: OccurrenceProjectionIdentity,
) {
  const projected = createOccurrenceProjection(
    source.task.id,
    source.task.version,
    schedule,
    state,
    transitionEligible,
    userTimezone,
    identity,
  );
  const item = {
    projectionKind: "recurring" as const,
    task: mapTask(source.task),
    occurrence: projected.occurrence,
  };
  projections.set(eventIdentity(source.task.id, projected.occurrence.occurrenceKey), {
    item,
    sortStart: projected.sortStart,
    taskId: source.task.id,
    occurrenceKey: projected.occurrence.occurrenceKey,
  });
}

function projectOneOff(source: StoredScheduledTask, userTimezone: string): SortableProjection {
  const schedule = storedScheduleValue(source.schedule, userTimezone);
  return {
    item: { projectionKind: "one_off", task: mapTask(source.task), schedule: mapSchedule(source.schedule) },
    sortStart: scheduleSortStart(schedule, userTimezone),
    taskId: source.task.id,
    occurrenceKey: "",
  };
}

function storedScheduleValue(
  schedule: StoredTaskSchedule,
  allDayTimezone: string,
): RecurrenceOccurrenceSchedule {
  if (schedule.kind === "all_day" && schedule.startDate && schedule.endDate) {
    return {
      kind: "all_day",
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      timezone: allDayTimezone,
    };
  }
  if (schedule.kind === "timed" && schedule.startAt && schedule.endAt && schedule.timezone) {
    return {
      kind: "timed",
      startAt: schedule.startAt.toISOString(),
      endAt: schedule.endAt.toISOString(),
      timezone: schedule.timezone,
    };
  }
  throw new Error("Stored schedule is incomplete.");
}

function repositoryRange(query: TaskOccurrenceRangeQuery) {
  return {
    rangeStartDate: query.rangeStartDate,
    rangeEndDate: query.rangeEndDate,
    rangeStartAt: new Date(query.rangeStartAt),
    rangeEndAt: new Date(query.rangeEndAt),
    limit: RECURRENCE_SOURCE_LIMIT,
  };
}

function compareProjection(left: SortableProjection, right: SortableProjection): number {
  if (left.sortStart !== right.sortStart) return left.sortStart < right.sortStart ? -1 : 1;
  if (left.taskId !== right.taskId) return left.taskId < right.taskId ? -1 : 1;
  if (left.occurrenceKey === right.occurrenceKey) return 0;
  return left.occurrenceKey < right.occurrenceKey ? -1 : 1;
}

function projectionIdentity(projection: SortableProjection): string {
  return `one-off:${projection.taskId}`;
}

function eventIdentity(taskId: string, occurrenceKey: string): string {
  return `${taskId}:${occurrenceKey}`;
}

function orderedReasons(reasons: ReadonlySet<OccurrenceTruncation["reasons"][number]>) {
  const order = [
    "source_limit",
    "event_source_limit",
    "series_candidate_limit",
    "request_candidate_limit",
    "output_limit",
  ] as const;
  return order.filter((reason) => reasons.has(reason));
}
