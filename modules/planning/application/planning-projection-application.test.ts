import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPlanningProjectionApplication,
  type PlanningTaskSourceReader,
  type PlanningTimeZoneReader,
} from "@/modules/planning";
import type { TaskDto, TaskScheduleDto } from "@/modules/tasks";
import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { Clock } from "@/shared/time/clock";

const actor: AuthenticatedActor = { userId: "10000000-0000-4000-8000-000000000001" };
const taskId = "20000000-0000-4000-8000-000000000001";
const secondTaskId = "20000000-0000-4000-8000-000000000002";
const listId = "30000000-0000-4000-8000-000000000001";

const tasks: PlanningTaskSourceReader = { readOpenTasks: vi.fn() };
const timeZones: PlanningTimeZoneReader = { getSavedTimeZone: vi.fn() };
const clock: Clock = { now: vi.fn() };

describe("planning projection application", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(timeZones.getSavedTimeZone).mockResolvedValue("Asia/Singapore");
    vi.mocked(clock.now).mockReturnValue(new Date("2026-07-20T04:00:00Z"));
    vi.mocked(tasks.readOpenTasks).mockResolvedValue({ items: [], truncated: false });
  });

  it("derives a DST-safe Today read and propagates source truncation", async () => {
    vi.mocked(timeZones.getSavedTimeZone).mockResolvedValue("America/New_York");
    vi.mocked(clock.now).mockReturnValue(new Date("2026-03-08T12:00:00Z"));
    vi.mocked(tasks.readOpenTasks).mockResolvedValue({
      items: [
        {
          task: canonicalTask(taskId),
          schedule: allDaySchedule(taskId, "2026-03-08", "2026-03-09"),
        },
      ],
      truncated: true,
    });

    const projection = await application().getToday(actor, { limit: 25 });

    expect(tasks.readOpenTasks).toHaveBeenCalledWith(actor, {
      kind: "scheduled_through",
      exclusiveEndDate: "2026-03-09",
      exclusiveEndAt: "2026-03-09T04:00:00Z",
      limit: 25,
    });
    expect(projection.anytime.map((task) => task.id)).toEqual([taskId]);
    expect(projection.remainingCount).toBe(1);
    expect(projection.truncated).toBe(true);
  });

  it("builds Upcoming from the canonical seven-local-day range", async () => {
    const schedule = timedSchedule(taskId, "2026-07-21T01:00:00Z", "2026-07-21T02:00:00Z", "Asia/Singapore");
    vi.mocked(tasks.readOpenTasks).mockResolvedValue({
      items: [{ task: canonicalTask(taskId), schedule }],
      truncated: false,
    });

    const projection = await application().getSmartDestination(actor, "upcoming", { limit: 50 });

    expect(tasks.readOpenTasks).toHaveBeenCalledWith(actor, {
      kind: "scheduled_range",
      rangeStartDate: "2026-07-20",
      rangeEndDate: "2026-07-27",
      rangeStartAt: "2026-07-19T16:00:00Z",
      rangeEndAt: "2026-07-26T16:00:00Z",
      limit: 50,
    });
    expect("days" in projection && projection.days[1]?.items[0]?.id).toBe(taskId);
  });

  it("uses one bounded range contract for Calendar and Agenda", async () => {
    vi.mocked(tasks.readOpenTasks).mockResolvedValue({
      items: [
        {
          task: canonicalTask(taskId),
          schedule: allDaySchedule(taskId, "2026-07-20", "2026-07-21"),
        },
      ],
      truncated: true,
    });
    const query = { rangeStartDate: "2026-07-20", rangeEndDate: "2026-07-21", limit: 10 };

    const calendar = await application().getCalendarRange(actor, query);
    const agenda = await application().getAgendaRange(actor, query);

    expect(tasks.readOpenTasks).toHaveBeenNthCalledWith(1, actor, {
      kind: "scheduled_range",
      rangeStartDate: "2026-07-20",
      rangeEndDate: "2026-07-21",
      rangeStartAt: "2026-07-19T16:00:00Z",
      rangeEndAt: "2026-07-20T16:00:00Z",
      limit: 10,
    });
    expect(calendar.events).toHaveLength(1);
    expect(calendar.truncated).toBe(true);
    expect(agenda.items).toEqual([{ groupDate: "2026-07-20", event: calendar.events[0] }]);
    expect(agenda.truncated).toBe(true);
  });

  it("loads all open rows for Matrix and preserves unscheduled tasks", async () => {
    vi.mocked(tasks.readOpenTasks).mockResolvedValue({
      items: [{ task: canonicalTask(taskId, { priority: "high" }), schedule: null }],
      truncated: true,
    });

    const projection = await application().getEisenhower(actor, { limit: 30 });

    expect(tasks.readOpenTasks).toHaveBeenCalledWith(actor, { kind: "all_open", limit: 30 });
    expect(projection.plan.map((task) => task.id)).toEqual([taskId]);
    expect(projection.truncated).toBe(true);
  });

  it("rejects duplicate, mismatched, and over-limit source pages", async () => {
    vi.mocked(tasks.readOpenTasks).mockResolvedValueOnce({
      items: [
        { task: canonicalTask(taskId), schedule: null },
        { task: canonicalTask(taskId), schedule: null },
      ],
      truncated: false,
    });
    await expect(application().getEisenhower(actor)).rejects.toThrow("duplicate task");

    vi.mocked(tasks.readOpenTasks).mockResolvedValueOnce({
      items: [
        {
          task: canonicalTask(taskId),
          schedule: allDaySchedule(secondTaskId, "2026-07-20", "2026-07-21"),
        },
      ],
      truncated: false,
    });
    await expect(application().getToday(actor)).rejects.toThrow("wrong task");

    vi.mocked(tasks.readOpenTasks).mockResolvedValueOnce({
      items: [
        { task: canonicalTask(taskId), schedule: null },
        { task: canonicalTask(secondTaskId), schedule: null },
      ],
      truncated: true,
    });
    await expect(application().getEisenhower(actor, { limit: 1 })).rejects.toThrow(
      "exceeded its requested row limit",
    );
  });

  it("rejects an invalid injected timezone before reading tasks", async () => {
    vi.mocked(timeZones.getSavedTimeZone).mockResolvedValue("Mars/Olympus");
    await expect(application().getToday(actor)).rejects.toThrow();
    expect(tasks.readOpenTasks).not.toHaveBeenCalled();
  });
});

function application() {
  return createPlanningProjectionApplication({ tasks, timeZones, clock });
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

function allDaySchedule(task: string, startDate: string, endDate: string): TaskScheduleDto {
  return {
    taskId: task,
    kind: "all_day",
    startDate,
    endDate,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
  };
}

function timedSchedule(task: string, startAt: string, endAt: string, timezone: string): TaskScheduleDto {
  return {
    taskId: task,
    kind: "timed",
    startAt,
    endAt,
    timezone,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
  };
}
