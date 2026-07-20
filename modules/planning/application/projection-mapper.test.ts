import { describe, expect, it } from "vitest";

import type { TaskDto } from "@/modules/tasks";

import { activeOpenTasks } from "../domain/projections/projection-model";
import {
  mapCanonicalSourcePage,
  mapOccurrenceSourcePage,
  toCalendarEvent,
  toPlanningTaskRow,
} from "./projection-mapper";

const taskId = "20000000-0000-4000-8000-000000000001";

describe("planning projection mapper", () => {
  it("maps a recurrence root to one unscheduled Matrix summary", () => {
    const [row] = mapCanonicalSourcePage(
      {
        items: [
          {
            task: task(),
            schedule: {
              taskId,
              kind: "all_day",
              startDate: "2026-07-20",
              endDate: "2026-07-21",
              createdAt: "2026-07-19T00:00:00Z",
              updatedAt: "2026-07-19T00:00:00Z",
            },
            recurrenceRoot: true,
          },
        ],
        truncated: false,
      },
      { limit: 10, schedulesRequired: false },
    );

    expect(row).toMatchObject({
      taskId,
      projectionId: `series:${taskId}`,
      projectionLifecycle: "recurrence_summary",
      recurrenceSummary: "No occurrence in the next 62 days",
      schedule: null,
    });
    const [openRow] = activeOpenTasks(row === undefined ? [] : [row]);
    if (openRow === undefined) throw new Error("Expected an open source row.");
    const projectedRow = toPlanningTaskRow(openRow);
    expect(projectedRow).toMatchObject({
      id: taskId,
      occurrenceKey: null,
      scheduleInteraction: { editScope: "series", dragEnabled: false },
    });
    expect(projectedRow).not.toHaveProperty("taskId");
  });

  it("carries terminal occurrence identity through Calendar DTO mapping", () => {
    const [row] = mapOccurrenceSourcePage(
      occurrencePage([
        {
          projectionKind: "recurring",
          task: task(),
          occurrence: {
            taskId,
            taskVersion: 1,
            occurrenceKey: "o1.completed",
            occurrenceState: "completed",
            transitionEligible: true,
            schedule: {
              kind: "timed",
              startAt: "2026-07-20T01:00:00Z",
              endAt: "2026-07-20T02:00:00Z",
              timezone: "Asia/Singapore",
            },
          },
        },
      ]),
      10,
    );

    if (row?.schedule === null || row === undefined) throw new Error("Expected a scheduled row.");
    expect(toCalendarEvent({ ...row, status: "open", schedule: row.schedule })).toMatchObject({
      taskId,
      projectionId: `occurrence:${taskId}:o1.completed`,
      occurrenceKey: "o1.completed",
      occurrenceState: "completed",
      scheduleInteraction: { dragEnabled: false },
    });
  });

  it("rejects duplicate projection IDs and inconsistent task versions", () => {
    const recurring = {
      projectionKind: "recurring" as const,
      task: task(),
      occurrence: {
        taskId,
        taskVersion: 1,
        occurrenceKey: "o1.same",
        occurrenceState: "open" as const,
        transitionEligible: true,
        schedule: { kind: "all_day" as const, startDate: "2026-07-20", endDate: "2026-07-21" },
      },
    };
    expect(() => mapOccurrenceSourcePage(occurrencePage([recurring, recurring]), 10)).toThrow(
      /duplicate projection identity/i,
    );
    expect(() =>
      mapOccurrenceSourcePage(
        occurrencePage([{ ...recurring, occurrence: { ...recurring.occurrence, taskVersion: 2 } }]),
        10,
      ),
    ).toThrow(/wrong task version/i);
  });
});

function occurrencePage(
  items: Parameters<typeof mapOccurrenceSourcePage>[0]["items"],
): Parameters<typeof mapOccurrenceSourcePage>[0] {
  return {
    items,
    truncation: {
      truncated: false,
      reasons: [],
      recurrenceRowsEvaluated: 0,
      occurrenceEventsEvaluated: 0,
      candidateEvaluations: 0,
    },
  };
}

function task(): TaskDto {
  return {
    id: taskId,
    listId: "30000000-0000-4000-8000-000000000001",
    sectionId: null,
    parentTaskId: null,
    title: "Recurring task",
    descriptionMd: "",
    status: "open",
    priority: "high",
    rank: "a0",
    statusChangedAt: "2026-07-19T00:00:00Z",
    version: 1,
    createdAt: "2026-07-19T00:00:00Z",
    updatedAt: "2026-07-19T00:00:00Z",
    deletedAt: null,
  };
}
