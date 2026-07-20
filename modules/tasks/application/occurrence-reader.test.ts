import type { Database } from "@/shared/db/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repositories = vi.hoisted(() => ({
  schedules: { listActiveOpenOneOffsInRange: vi.fn() },
  recurrences: { listActiveOpenSourcesInRange: vi.fn() },
  events: { listLatestForTasks: vi.fn() },
}));

vi.mock("../infrastructure/task-schedule-repository", () => ({
  createTaskScheduleRepository: () => repositories.schedules,
}));
vi.mock("../infrastructure/task-recurrence-repository", () => ({
  createTaskRecurrenceRepository: () => repositories.recurrences,
}));
vi.mock("../infrastructure/task-occurrence-event-repository", () => ({
  createTaskOccurrenceEventRepository: () => repositories.events,
}));

import { createBoundedOccurrenceReader } from "./occurrence-reader";
import type { RecurrenceExpansionPort } from "./recurrence-expansion-port";
import { createOccurrenceKey } from "../domain/recurrence/occurrence-key";
import type { TaskScheduleTable } from "../infrastructure/schema";

const userId = "10000000-0000-4000-8000-000000000001";
const recurringTaskId = "20000000-0000-4000-8000-000000000001";
const oneOffTaskId = "20000000-0000-4000-8000-000000000002";
const listId = "30000000-0000-4000-8000-000000000001";
const now = new Date("2026-07-20T00:00:00.000Z");
const actor = { userId };
const database = {} as Database;
const taskSchedules = {} as TaskScheduleTable;
const currentKey = createOccurrenceKey(recurringTaskId, {
  kind: "all_day",
  startDate: "2026-07-21",
});
const recordedPriorKey = createOccurrenceKey(recurringTaskId, {
  kind: "all_day",
  startDate: "2026-07-20",
});
const expansion: RecurrenceExpansionPort = {
  expand: vi.fn(() => ({
    candidates: [{ kind: "all_day" as const, startDate: "2026-07-21" }],
    truncated: false,
  })),
  next: vi.fn(),
};

function storedTask(id: string) {
  return {
    id,
    userId,
    listId,
    sectionId: null,
    parentTaskId: null,
    title: id === recurringTaskId ? "Daily review" : "One-off launch",
    descriptionMd: "",
    status: "open",
    priority: "none",
    rank: "a0",
    statusChangedAt: now,
    version: 4,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

function recurringSchedule() {
  return {
    userId,
    taskId: recurringTaskId,
    kind: "all_day",
    startDate: "2026-07-19",
    endDate: "2026-07-20",
    startAt: null,
    endAt: null,
    timezone: null,
    createdAt: now,
    updatedAt: now,
  };
}

function recurrence() {
  return {
    userId,
    taskId: recurringTaskId,
    rrule: "FREQ=DAILY;INTERVAL=1",
    timezone: "Asia/Singapore",
    generationMode: "schedule",
    projectionStartDate: "2026-07-21",
    projectionStartAt: null,
    projectionEndDate: null,
    projectionEndAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function oneOffSchedule() {
  return {
    userId,
    taskId: oneOffTaskId,
    kind: "all_day",
    startDate: "2026-07-22",
    endDate: "2026-07-23",
    startAt: null,
    endAt: null,
    timezone: null,
    createdAt: now,
    updatedAt: now,
  };
}

function event(occurrenceKey: string, state: "open" | "completed" | "skipped", taskVersion: number) {
  return {
    id: `40000000-0000-4000-8000-00000000000${taskVersion}`,
    userId,
    taskId: recurringTaskId,
    occurrenceKey,
    state,
    taskVersion,
    effectiveAt: now,
    createdAt: now,
  };
}

function query(limit = 500) {
  return {
    rangeStartDate: "2026-07-20",
    rangeEndDate: "2026-07-24",
    rangeStartAt: "2026-07-19T16:00:00.000Z",
    rangeEndAt: "2026-07-23T16:00:00.000Z",
    limit,
  };
}

function reader() {
  return createBoundedOccurrenceReader({
    database,
    taskSchedules,
    expansion,
    resolveUserTimezone: vi.fn(async () => "Asia/Singapore"),
  });
}

describe("bounded occurrence reader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositories.schedules.listActiveOpenOneOffsInRange.mockResolvedValue({
      items: [{ task: storedTask(oneOffTaskId), schedule: oneOffSchedule() }],
      truncated: false,
    });
    repositories.recurrences.listActiveOpenSourcesInRange.mockResolvedValue({
      items: [
        {
          task: storedTask(recurringTaskId),
          schedule: recurringSchedule(),
          recurrence: recurrence(),
        },
      ],
      truncated: false,
    });
    repositories.events.listLatestForTasks.mockResolvedValue({
      items: [event(recordedPriorKey, "completed", 2), event(currentKey, "skipped", 3)],
      truncated: false,
    });
  });

  it("merges current expansion, recorded prior keys, and one-offs in canonical start order", async () => {
    const page = await reader()(actor, query());

    expect(page.items).toHaveLength(3);
    expect(page.items.map((item) => item.projectionKind)).toEqual(["recurring", "recurring", "one_off"]);
    expect(page.items[0]).toMatchObject({
      occurrence: { occurrenceKey: recordedPriorKey, occurrenceState: "completed" },
    });
    expect(page.items[1]).toMatchObject({
      occurrence: { occurrenceKey: currentKey, occurrenceState: "skipped" },
    });
    expect(page.truncation).toEqual({
      truncated: false,
      reasons: [],
      recurrenceRowsEvaluated: 1,
      occurrenceEventsEvaluated: 2,
      candidateEvaluations: 1,
    });
    expect(repositories.events.listLatestForTasks).toHaveBeenCalledWith(userId, [recurringTaskId], 50_000);
  });

  it("reports output, source, event, and series cap truncation explicitly", async () => {
    repositories.schedules.listActiveOpenOneOffsInRange.mockResolvedValueOnce({
      items: [{ task: storedTask(oneOffTaskId), schedule: oneOffSchedule() }],
      truncated: true,
    });
    repositories.events.listLatestForTasks.mockResolvedValueOnce({
      items: [event(currentKey, "skipped", 3)],
      truncated: true,
    });
    vi.mocked(expansion.expand).mockReturnValueOnce({
      candidates: [{ kind: "all_day" as const, startDate: "2026-07-21" }],
      truncated: true,
    });

    const page = await reader()(actor, query(1));
    expect(page.items).toHaveLength(1);
    expect(page.truncation.truncated).toBe(true);
    expect(page.truncation.reasons).toEqual([
      "source_limit",
      "event_source_limit",
      "series_candidate_limit",
      "output_limit",
    ]);
  });
});
