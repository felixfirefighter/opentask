import { describe, expect, it } from "vitest";

import type { TaskListItemDto, TaskPage, TaskSearchPage } from "../../application/contracts";

import { combineTerminalTasks, flattenTaskPages, flattenTaskSearchPages } from "./task-page-view";

const FIRST_TASK_ID = "0da6e6d9-2cf0-47cc-b869-964b6e91c3c0";
const SECOND_TASK_ID = "f1c528b7-cfc6-4fe6-b5c2-9b536434a6fd";
const LIST_ID = "81770f70-1b5b-450a-be9e-012569d256a6";

function task(id: string, statusChangedAt: string): TaskListItemDto {
  return {
    id,
    listId: LIST_ID,
    sectionId: null,
    parentTaskId: null,
    title: `Task ${id}`,
    descriptionMd: "",
    status: "completed",
    priority: "none",
    rank: "a",
    statusChangedAt,
    tags: [],
    recurrence: null,
    version: 1,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    deletedAt: null,
  };
}

describe("task page view", () => {
  it("flattens bounded task pages without inventing records", () => {
    const first = task(FIRST_TASK_ID, "2026-07-19T01:00:00.000Z");
    const second = task(SECOND_TASK_ID, "2026-07-19T02:00:00.000Z");
    const pages: TaskPage[] = [
      { items: [first], nextCursor: "next" },
      { items: [second], nextCursor: null },
    ];

    expect(flattenTaskPages(pages)).toEqual([first, second]);
    expect(flattenTaskPages(undefined)).toEqual([]);
  });

  it("flattens search pages while preserving result context", () => {
    const result = {
      task: task(FIRST_TASK_ID, "2026-07-19T01:00:00.000Z"),
      list: { id: LIST_ID, name: "Launch" },
      matchedFields: ["title" as const],
      matchingTags: [],
    };
    const pages: TaskSearchPage[] = [{ items: [result], nextCursor: null }];

    expect(flattenTaskSearchPages(pages)).toEqual([result]);
    expect(flattenTaskSearchPages(undefined)).toEqual([]);
  });

  it("combines terminal projections by latest transition with a stable id tie-break", () => {
    const earlier = task(FIRST_TASK_ID, "2026-07-19T01:00:00.000Z");
    const later = { ...task(SECOND_TASK_ID, "2026-07-19T02:00:00.000Z"), status: "cancelled" as const };

    expect(combineTerminalTasks([earlier], [later])).toEqual([later, earlier]);
    expect(combineTerminalTasks([earlier], [])).toEqual([earlier]);
  });
});
