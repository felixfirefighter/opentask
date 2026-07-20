import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPlanningProjectionApplication } from "@/modules/planning";
import type { TaskDto, TaskScheduleDto, TaskScheduleValue } from "@/modules/tasks";
import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Clock } from "@/shared/time/clock";

import type {
  PlanningCompositeSourceReader,
  PlanningOccurrenceSourceReader,
  PlanningTaskSourcePage,
  PlanningTimeZoneReader,
} from "./planning-source-reader";

const actor: AuthenticatedActor = { userId: "10000000-0000-4000-8000-000000000001" };
const taskId = "20000000-0000-4000-8000-000000000001";
const secondTaskId = "20000000-0000-4000-8000-000000000002";
const listId = "30000000-0000-4000-8000-000000000001";

const composite: PlanningCompositeSourceReader = { readPlanningSnapshot: vi.fn() };
const occurrences: PlanningOccurrenceSourceReader = { readBoundedOccurrences: vi.fn() };
const timeZones: PlanningTimeZoneReader = { getSavedTimeZone: vi.fn() };
const clock: Clock = { now: vi.fn() };

describe("planning projection application", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(timeZones.getSavedTimeZone).mockResolvedValue("Asia/Singapore");
    vi.mocked(clock.now).mockReturnValue(new Date("2026-07-20T04:00:00Z"));
    vi.mocked(composite.readPlanningSnapshot).mockImplementation(async (_actor, request) =>
      compositeResult(
        taskPage(),
        request.occurrenceQueries.map(() => occurrencePage()),
      ),
    );
    vi.mocked(occurrences.readBoundedOccurrences).mockResolvedValue(occurrencePage());
  });

  it("keeps the one-off overdue read and bounds recurring Today projection to the current local day", async () => {
    vi.mocked(timeZones.getSavedTimeZone).mockResolvedValue("America/New_York");
    vi.mocked(clock.now).mockReturnValue(new Date("2026-03-08T12:00:00Z"));
    vi.mocked(composite.readPlanningSnapshot).mockResolvedValue(
      compositeResult(
        taskPage(
          [
            {
              task: canonicalTask(taskId),
              schedule: allDaySchedule(taskId, "2026-03-08", "2026-03-09"),
              recurrenceRoot: false,
            },
          ],
          true,
        ),
        [occurrencePage()],
      ),
    );

    const projection = await application().getToday(actor, { limit: 25 });

    expect(composite.readPlanningSnapshot).toHaveBeenCalledTimes(1);
    expect(composite.readPlanningSnapshot).toHaveBeenCalledWith(actor, {
      timeZone: "America/New_York",
      taskQuery: {
        kind: "scheduled_through",
        exclusiveEndDate: "2026-03-09",
        exclusiveEndAt: "2026-03-09T04:00:00Z",
        limit: 25,
      },
      occurrenceQueries: [
        {
          rangeStartDate: "2026-03-08",
          rangeEndDate: "2026-03-09",
          rangeStartAt: "2026-03-08T05:00:00Z",
          rangeEndAt: "2026-03-09T04:00:00Z",
          limit: 25,
        },
      ],
    });
    expect(occurrences.readBoundedOccurrences).not.toHaveBeenCalled();
    expect(projection.anytime.map((task) => task.id)).toEqual([taskId]);
    expect(projection.truncated).toBe(true);
    expect(projection.truncationReasons).toEqual(["task_source_limit"]);
  });

  it("builds Upcoming from the bounded combined occurrence source", async () => {
    vi.mocked(occurrences.readBoundedOccurrences).mockResolvedValue(
      occurrencePage([
        recurring(taskId, "o1.upcoming", timed("2026-07-21T01:00:00Z", "2026-07-21T02:00:00Z")),
      ]),
    );

    const projection = await application().getSmartDestination(actor, "upcoming", { limit: 50 });

    expect(composite.readPlanningSnapshot).not.toHaveBeenCalled();
    expect(occurrences.readBoundedOccurrences).toHaveBeenCalledWith(
      actor,
      {
        rangeStartDate: "2026-07-20",
        rangeEndDate: "2026-07-27",
        rangeStartAt: "2026-07-19T16:00:00Z",
        rangeEndAt: "2026-07-26T16:00:00Z",
        limit: 50,
      },
      "Asia/Singapore",
    );
    expect("days" in projection && projection.days[1]?.items[0]?.occurrenceKey).toBe("o1.upcoming");
  });

  it("caps the merged Today result even when both independent sources reach the requested limit", async () => {
    vi.mocked(composite.readPlanningSnapshot).mockResolvedValue(
      compositeResult(
        taskPage([
          {
            task: canonicalTask(taskId),
            schedule: allDaySchedule(taskId, "2026-07-20", "2026-07-21"),
            recurrenceRoot: false,
          },
        ]),
        [
          occurrencePage([
            recurring(secondTaskId, "o1.today", timed("2026-07-20T05:00:00Z", "2026-07-20T06:00:00Z")),
          ]),
        ],
      ),
    );

    const projection = await application().getToday(actor, { limit: 1 });

    expect(projection.remainingCount).toBe(1);
    expect([...projection.overdue, ...projection.timed, ...projection.anytime]).toHaveLength(1);
    expect(projection.truncated).toBe(true);
    expect(projection.truncationReasons).toEqual(["projection_output_limit"]);
  });

  it("preserves completed and skipped recurrence rows for Calendar and Agenda Undo", async () => {
    vi.mocked(occurrences.readBoundedOccurrences).mockResolvedValue(
      occurrencePage(
        [
          recurring(taskId, "o1.completed", allDay("2026-07-20", "2026-07-21"), "completed"),
          recurring(
            secondTaskId,
            "o1.skipped",
            timed("2026-07-20T01:00:00Z", "2026-07-20T02:00:00Z"),
            "skipped",
          ),
        ],
        true,
      ),
    );
    const query = { rangeStartDate: "2026-07-20", rangeEndDate: "2026-07-21", limit: 10 };

    const calendar = await application().getCalendarRange(actor, query);
    const agenda = await application().getAgendaRange(actor, query);

    expect(calendar.events.map((event) => event.occurrenceState)).toEqual(["completed", "skipped"]);
    expect(calendar.events.every((event) => !event.scheduleInteraction.dragEnabled)).toBe(true);
    expect(agenda.items.map((row) => row.event.occurrenceState)).toEqual(["completed", "skipped"]);
    expect(composite.readPlanningSnapshot).not.toHaveBeenCalled();
    expect(occurrences.readBoundedOccurrences).toHaveBeenCalledTimes(2);
    expect(calendar.truncated).toBe(true);
    expect(agenda.truncated).toBe(true);
    expect(calendar.truncationReasons).toEqual(["recurrence_source_limit"]);
    expect(agenda.truncationReasons).toEqual(["recurrence_source_limit"]);
  });

  it("performs the frozen Matrix reads and selects one earliest open occurrence per series", async () => {
    vi.mocked(composite.readPlanningSnapshot).mockResolvedValue(
      compositeResult(
        taskPage([
          {
            task: canonicalTask(taskId, { priority: "high" }),
            schedule: allDaySchedule(taskId, "2026-07-01", "2026-07-02"),
            recurrenceRoot: true,
          },
          { task: canonicalTask(secondTaskId), schedule: null, recurrenceRoot: false },
        ]),
        [
          occurrencePage([
            recurring(taskId, "o1.spanning", timed("2026-07-19T15:00:00Z", "2026-07-19T17:00:00Z"), "open", {
              priority: "high",
            }),
          ]),
          occurrencePage(
            [
              recurring(taskId, "o1.future", timed("2026-07-21T01:00:00Z", "2026-07-21T02:00:00Z"), "open", {
                priority: "high",
              }),
            ],
            true,
          ),
        ],
      ),
    );

    const projection = await application().getEisenhower(actor, { limit: 30 });

    expect(composite.readPlanningSnapshot).toHaveBeenCalledTimes(1);
    expect(composite.readPlanningSnapshot).toHaveBeenCalledWith(actor, {
      timeZone: "Asia/Singapore",
      taskQuery: { kind: "all_open", limit: 30 },
      occurrenceQueries: [
        {
          rangeStartDate: "2026-06-19",
          rangeEndDate: "2026-07-20",
          rangeStartAt: "2026-06-18T16:00:00Z",
          rangeEndAt: "2026-07-19T16:00:00Z",
          limit: 30,
        },
        {
          rangeStartDate: "2026-07-20",
          rangeEndDate: "2026-09-20",
          rangeStartAt: "2026-07-19T16:00:00Z",
          rangeEndAt: "2026-09-19T16:00:00Z",
          limit: 30,
        },
      ],
    });
    expect(occurrences.readBoundedOccurrences).not.toHaveBeenCalled();
    expect(projection.doNow[0]).toMatchObject({
      id: taskId,
      occurrenceKey: "o1.spanning",
      projectionLifecycle: "recurring_occurrence",
    });
    expect(projection.later[0]).toMatchObject({ id: secondTaskId, projectionLifecycle: "one_off" });
    expect(projection.truncated).toBe(true);
    expect(projection.truncationReasons).toEqual(["recurrence_source_limit"]);
  });

  it("emits one nonurgent series summary when the Matrix horizon has no occurrence", async () => {
    vi.mocked(composite.readPlanningSnapshot).mockResolvedValue(
      compositeResult(
        taskPage([
          {
            task: canonicalTask(taskId, { priority: "high" }),
            schedule: allDaySchedule(taskId, "2026-07-01", "2026-07-02"),
            recurrenceRoot: true,
          },
        ]),
        [occurrencePage(), occurrencePage()],
      ),
    );

    const projection = await application().getEisenhower(actor);

    expect(projection.plan).toHaveLength(1);
    expect(projection.plan[0]).toMatchObject({
      id: taskId,
      projectionLifecycle: "recurrence_summary",
      recurrenceSummary: "No occurrence in the next 62 days",
      occurrenceKey: null,
    });
  });

  it("rejects invalid source identities, caps, and injected timezones", async () => {
    vi.mocked(composite.readPlanningSnapshot).mockResolvedValueOnce(
      compositeResult(
        taskPage([
          { task: canonicalTask(taskId), schedule: null, recurrenceRoot: false },
          { task: canonicalTask(taskId), schedule: null, recurrenceRoot: false },
        ]),
        [occurrencePage(), occurrencePage()],
      ),
    );
    await expect(application().getEisenhower(actor)).rejects.toThrow("duplicate task");

    vi.mocked(composite.readPlanningSnapshot).mockClear();
    vi.mocked(timeZones.getSavedTimeZone).mockResolvedValue("Mars/Olympus");
    await expect(application().getToday(actor)).rejects.toThrow();
    expect(composite.readPlanningSnapshot).not.toHaveBeenCalled();
    expect(occurrences.readBoundedOccurrences).not.toHaveBeenCalled();
  });
});

function application() {
  return createPlanningProjectionApplication({ composite, occurrences, timeZones, clock });
}

function compositeResult(
  taskPageResult: PlanningTaskSourcePage,
  occurrencePages: readonly Awaited<ReturnType<PlanningOccurrenceSourceReader["readBoundedOccurrences"]>>[],
): Awaited<ReturnType<PlanningCompositeSourceReader["readPlanningSnapshot"]>> {
  return { taskPage: taskPageResult, occurrencePages };
}

function taskPage(items: PlanningTaskSourcePage["items"] = [], truncated = false): PlanningTaskSourcePage {
  return { items, truncated };
}

function occurrencePage(
  items: Awaited<ReturnType<PlanningOccurrenceSourceReader["readBoundedOccurrences"]>>["items"] = [],
  truncated = false,
) {
  return {
    items,
    truncation: {
      truncated,
      reasons: truncated ? (["source_limit"] as const) : [],
      recurrenceRowsEvaluated: 0,
      occurrenceEventsEvaluated: 0,
      candidateEvaluations: 0,
    },
  };
}

function recurring(
  id: string,
  occurrenceKey: string,
  schedule: TaskScheduleValue,
  occurrenceState: "open" | "completed" | "skipped" = "open",
  taskOverrides: Partial<TaskDto> = {},
) {
  const task = canonicalTask(id, taskOverrides);
  return {
    projectionKind: "recurring" as const,
    task,
    occurrence: {
      taskId: id,
      taskVersion: task.version,
      occurrenceKey,
      occurrenceState,
      transitionEligible: true,
      schedule,
    },
  };
}

function canonicalTask(id: string, overrides: Partial<TaskDto> = {}): TaskDto {
  return {
    id,
    listId,
    sectionId: null,
    parentTaskId: null,
    title: `Task ${id.slice(-1)}`,
    descriptionMd: "",
    status: "open",
    priority: "none",
    rank: `a${id.slice(-1)}`,
    statusChangedAt: "2026-07-19T00:00:00.000Z",
    version: 1,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

function allDaySchedule(taskId: string, startDate: string, endDate: string): TaskScheduleDto {
  return {
    taskId,
    ...allDay(startDate, endDate),
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
  };
}

function timed(startAt: string, endAt: string): TaskScheduleValue {
  return { kind: "timed", startAt, endAt, timezone: "Asia/Singapore" };
}

function allDay(startDate: string, endDate: string): TaskScheduleValue {
  return { kind: "all_day", startDate, endDate };
}
