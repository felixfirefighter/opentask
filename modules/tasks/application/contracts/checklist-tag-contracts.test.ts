import { describe, expect, it } from "vitest";

import {
  checklistItemDtoSchema,
  createChecklistItemRequestSchema,
  deleteChecklistItemRequestSchema,
  positionChecklistItemRequestSchema,
  updateChecklistItemRequestSchema,
} from "./checklist-contract";
import {
  createTagRequestSchema,
  replaceTaskTagsRequestSchema,
  replaceTaskTagsOutputSchema,
  tagDtoSchema,
  tagQuerySchema,
  updateTagRequestSchema,
} from "./tag-contract";

const taskId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const tagId = "33333333-3333-4333-8333-333333333333";
const timestamp = "2026-07-19T01:02:03.000Z";

describe("checklist contracts", () => {
  it("keeps checklist creation lightweight and path-scoped", () => {
    expect(createChecklistItemRequestSchema.parse({ title: " Verify mobile " })).toEqual({
      title: "Verify mobile",
      placement: { kind: "end" },
    });
    expect(createChecklistItemRequestSchema.parse({ title: "x".repeat(500) })).toBeTruthy();
    expect(() => createChecklistItemRequestSchema.parse({ title: "x".repeat(501) })).toThrow();

    for (const forbidden of ["id", "taskId", "userId", "rank", "version", "isCompleted", "schedule"]) {
      expect(() =>
        createChecklistItemRequestSchema.parse({ title: "Verify mobile", [forbidden]: itemId }),
      ).toThrow();
    }
  });

  it("allows only versioned title/completion edits, position, and hard deletion", () => {
    expect(
      updateChecklistItemRequestSchema.parse({ expectedVersion: 1, patch: { isCompleted: true } }),
    ).toBeTruthy();
    expect(
      updateChecklistItemRequestSchema.parse({ expectedVersion: 1, patch: { title: "Done" } }),
    ).toBeTruthy();
    expect(() => updateChecklistItemRequestSchema.parse({ expectedVersion: 1, patch: {} })).toThrow();
    expect(
      positionChecklistItemRequestSchema.parse({ expectedVersion: 1, placement: { kind: "start" } }),
    ).toBeTruthy();
    expect(deleteChecklistItemRequestSchema.parse({ expectedVersion: 1 })).toEqual({ expectedVersion: 1 });
  });

  it("validates the strict server DTO", () => {
    const dto = {
      id: itemId,
      taskId,
      title: "Verify mobile",
      isCompleted: false,
      rank: "a0",
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    expect(checklistItemDtoSchema.parse(dto)).toEqual(dto);
    expect(() => checklistItemDtoSchema.parse({ ...dto, status: "open" })).toThrow();
    expect(() => checklistItemDtoSchema.parse({ ...dto, deletedAt: null })).toThrow();
  });
});

describe("tag contracts", () => {
  it("validates create, update, response, and collection queries", () => {
    expect(createTagRequestSchema.parse({ name: " Launch ", colorToken: "coral" })).toEqual({
      name: "Launch",
      colorToken: "coral",
    });
    expect(() => createTagRequestSchema.parse({ name: "Launch", colorToken: "red" })).toThrow();
    expect(() => createTagRequestSchema.parse({ name: "Launch", colorToken: "coral", id: tagId })).toThrow();
    expect(updateTagRequestSchema.parse({ expectedVersion: 1, patch: { colorToken: "sky" } })).toBeTruthy();
    expect(() => updateTagRequestSchema.parse({ expectedVersion: 1, patch: {} })).toThrow();

    const dto = {
      id: tagId,
      name: "Launch",
      colorToken: "coral",
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };
    expect(tagDtoSchema.parse(dto)).toEqual(dto);
    expect(() => tagDtoSchema.parse({ ...dto, userId: taskId })).toThrow();
    expect(tagQuerySchema.parse({})).toEqual({ limit: 50 });
  });

  it("validates the strict task-tag replacement response envelope", () => {
    const tag = {
      id: tagId,
      name: "Launch",
      colorToken: "coral",
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };
    const output = { task: { id: taskId, version: 2 }, tags: [tag] };

    expect(replaceTaskTagsOutputSchema.parse(output)).toEqual(output);
    expect(() => replaceTaskTagsOutputSchema.parse({ ...output, userId: taskId })).toThrow();
    expect(() =>
      replaceTaskTagsOutputSchema.parse({ ...output, task: { ...output.task, title: "Hidden" } }),
    ).toThrow();
  });

  it("uses one strict POST-compatible replacement with at most 100 unique tag IDs", () => {
    expect(replaceTaskTagsRequestSchema.parse({ expectedVersion: 1, tagIds: [] })).toEqual({
      expectedVersion: 1,
      tagIds: [],
    });
    expect(replaceTaskTagsRequestSchema.parse({ expectedVersion: 1, tagIds: [tagId] })).toBeTruthy();
    expect(() =>
      replaceTaskTagsRequestSchema.parse({ expectedVersion: 1, tagIds: [tagId, tagId] }),
    ).toThrow();
    expect(() =>
      replaceTaskTagsRequestSchema.parse({
        expectedVersion: 1,
        tagIds: Array.from(
          { length: 101 },
          (_, index) => `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
        ),
      }),
    ).toThrow();
    expect(() =>
      replaceTaskTagsRequestSchema.parse({ expectedVersion: 1, tagIds: [], userId: taskId }),
    ).toThrow();
  });
});
