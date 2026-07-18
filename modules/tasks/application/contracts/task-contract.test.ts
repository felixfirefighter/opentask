import { describe, expect, it } from "vitest";

import {
  createTaskRequestSchema,
  moveTaskRequestSchema,
  positionTaskRequestSchema,
  taskDetailDtoSchema,
  taskDtoSchema,
  taskQuerySchema,
  taskSearchPageSchema,
  taskSearchQuerySchema,
  taskVersionRefSchema,
  transitionTaskStatusRequestSchema,
  updateTaskRequestSchema,
} from "./task-contract";

const taskId = "11111111-1111-4111-8111-111111111111";
const listId = "22222222-2222-4222-8222-222222222222";
const sectionId = "33333333-3333-4333-8333-333333333333";
const tagId = "44444444-4444-4444-8444-444444444444";
const itemId = "55555555-5555-4555-8555-555555555555";
const timestamp = "2026-07-19T01:02:03.000Z";

const taskDto = {
  id: taskId,
  listId,
  sectionId: null,
  parentTaskId: null,
  title: "Ship the demo",
  descriptionMd: "Validate the **release**.",
  status: "open",
  priority: "high",
  rank: "a0",
  statusChangedAt: timestamp,
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
  deletedAt: null,
} as const;

describe("task mutation contracts", () => {
  it("defaults only approved create fields", () => {
    expect(createTaskRequestSchema.parse({ title: " Ship the demo ", listId })).toEqual({
      title: "Ship the demo",
      descriptionMd: "",
      priority: "none",
      listId,
      sectionId: null,
      parentTaskId: null,
      placement: { kind: "end" },
    });
    expect(
      createTaskRequestSchema.parse({
        title: "Ship the demo",
        descriptionMd: "Details",
        priority: "high",
        listId,
        sectionId,
        parentTaskId: taskId,
        placement: { kind: "start" },
      }),
    ).toMatchObject({ sectionId, parentTaskId: taskId, priority: "high" });
  });

  it("rejects client IDs, ownership, state, rank, timestamps, and later-package concepts", () => {
    for (const forbidden of [
      "id",
      "userId",
      "status",
      "kind",
      "rank",
      "version",
      "createdAt",
      "updatedAt",
      "deletedAt",
      "schedule",
      "recurrence",
      "reminder",
    ]) {
      expect(() => createTaskRequestSchema.parse({ title: "Ship", listId, [forbidden]: taskId })).toThrow();
    }
  });

  it.each(["\ud800", "\udc00", "contains\0null"])(
    "rejects unsafe text in task writes and search",
    (unsafeText) => {
      expect(() => createTaskRequestSchema.parse({ title: unsafeText, listId })).toThrow();
      expect(() =>
        updateTaskRequestSchema.parse({ expectedVersion: 1, patch: { descriptionMd: unsafeText } }),
      ).toThrow();
      expect(() => taskSearchQuerySchema.parse({ q: unsafeText })).toThrow();
    },
  );

  it("enforces task text bounds and nonempty strict patches", () => {
    expect(createTaskRequestSchema.parse({ title: "x".repeat(500), listId })).toBeTruthy();
    expect(() => createTaskRequestSchema.parse({ title: "x".repeat(501), listId })).toThrow();
    expect(
      createTaskRequestSchema.parse({ title: "Ship", listId, descriptionMd: "x".repeat(20_000) }),
    ).toBeTruthy();
    expect(() =>
      createTaskRequestSchema.parse({ title: "Ship", listId, descriptionMd: "x".repeat(20_001) }),
    ).toThrow();
    expect(updateTaskRequestSchema.parse({ expectedVersion: 1, patch: { descriptionMd: "" } })).toBeTruthy();
    expect(() => updateTaskRequestSchema.parse({ expectedVersion: 1, patch: {} })).toThrow();
    expect(() =>
      updateTaskRequestSchema.parse({ expectedVersion: 1, patch: { priority: "high", status: "completed" } }),
    ).toThrow();
  });

  it("keeps status, movement, and positioning as explicit versioned commands", () => {
    for (const status of ["open", "completed", "cancelled"]) {
      expect(transitionTaskStatusRequestSchema.parse({ expectedVersion: 2, status })).toEqual({
        expectedVersion: 2,
        status,
      });
    }
    expect(
      moveTaskRequestSchema.parse({
        expectedVersion: 2,
        listId,
        sectionId,
        parentTaskId: null,
        placement: { kind: "after", anchorId: taskId },
      }),
    ).toBeTruthy();
    expect(
      positionTaskRequestSchema.parse({
        expectedVersion: 2,
        placement: { kind: "before", anchorId: taskId },
      }),
    ).toBeTruthy();
    expect(() =>
      moveTaskRequestSchema.parse({
        expectedVersion: 2,
        listId,
        sectionId: null,
        parentTaskId: null,
        placement: { kind: "end" },
        rank: "a0",
      }),
    ).toThrow();
  });
});

describe("task read contracts", () => {
  it("validates strict task and detail DTOs without later-package fields", () => {
    expect(taskDtoSchema.parse(taskDto)).toEqual(taskDto);
    expect(() => taskDtoSchema.parse({ ...taskDto, userId: listId })).toThrow();
    expect(() => taskDtoSchema.parse({ ...taskDto, schedule: null })).toThrow();

    const detail = {
      ...taskDto,
      checklistItems: [
        {
          id: itemId,
          taskId,
          title: "Verify mobile",
          isCompleted: false,
          rank: "a0",
          version: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      tags: [
        {
          id: tagId,
          name: "Launch",
          colorToken: "coral",
          version: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
          deletedAt: null,
        },
      ],
      subtasks: [{ ...taskDto, id: sectionId, parentTaskId: taskId }],
    };
    expect(taskDetailDtoSchema.parse(detail)).toEqual(detail);
    expect(() => taskDetailDtoSchema.parse({ ...detail, reminders: [] })).toThrow();
    expect(taskVersionRefSchema.parse({ id: taskId, version: 1 })).toEqual({ id: taskId, version: 1 });
    expect(() => taskVersionRefSchema.parse({ id: taskId, version: 1, title: "Ship" })).toThrow();
  });

  it("bounds task pages and applies query defaults", () => {
    expect(taskQuerySchema.parse({ listId })).toEqual({
      listId,
      parentTaskId: null,
      status: "open",
      limit: 50,
    });
    expect(
      taskQuerySchema.parse({
        listId,
        sectionId,
        parentTaskId: taskId,
        status: "cancelled",
        limit: "100",
        cursor: "next_1",
      }),
    ).toEqual({
      listId,
      sectionId,
      parentTaskId: taskId,
      status: "cancelled",
      limit: 100,
      cursor: "next_1",
    });
    expect(() => taskQuerySchema.parse({ listId, limit: 101 })).toThrow();
    expect(() => taskQuerySchema.parse({ listId, parentTaskId: "not-a-uuid" })).toThrow();
  });

  it("bounds strict search input and response context", () => {
    expect(taskSearchQuerySchema.parse({ q: " launch " })).toEqual({ q: "launch", limit: 20 });
    expect(taskSearchQuerySchema.parse({ q: "x".repeat(120), limit: "50" })).toMatchObject({ limit: 50 });
    expect(() => taskSearchQuerySchema.parse({ q: "x".repeat(121) })).toThrow();
    expect(() => taskSearchQuerySchema.parse({ q: "ship", limit: 51 })).toThrow();
    expect(() => taskSearchQuerySchema.parse({ q: "ship", userId: listId })).toThrow();

    expect(
      taskSearchPageSchema.parse({
        items: [
          {
            task: taskDto,
            list: { id: listId, name: "Launch" },
            matchedFields: ["title", "tag"],
            matchingTags: [],
          },
        ],
        nextCursor: null,
      }),
    ).toBeTruthy();
    expect(() =>
      taskSearchPageSchema.parse({
        items: [
          {
            task: taskDto,
            list: { id: listId, name: "Launch", userId: listId },
            matchedFields: ["title"],
            matchingTags: [],
          },
        ],
        nextCursor: null,
      }),
    ).toThrow();
    expect(() =>
      taskSearchPageSchema.parse({
        items: [
          {
            task: taskDto,
            list: { id: listId, name: "Launch" },
            matchedFields: ["tag", "tag"],
            matchingTags: [],
          },
        ],
        nextCursor: null,
      }),
    ).toThrow();
  });
});
