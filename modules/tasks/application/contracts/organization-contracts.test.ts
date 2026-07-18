import { describe, expect, it } from "vitest";

import {
  createFolderRequestSchema,
  deleteFolderRequestSchema,
  folderDtoSchema,
  folderQuerySchema,
  positionFolderRequestSchema,
  updateFolderRequestSchema,
} from "./folder-contract";
import {
  createRegularListRequestSchema,
  deleteRegularListRequestSchema,
  moveRegularListRequestSchema,
  regularListDtoSchema,
  regularListQuerySchema,
  updateRegularListRequestSchema,
} from "./list-contract";
import {
  createSectionRequestSchema,
  deleteSectionRequestSchema,
  positionSectionRequestSchema,
  sectionDtoSchema,
  sectionQuerySchema,
  updateSectionRequestSchema,
} from "./section-contract";

const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const createdAt = "2026-07-19T01:02:03.000Z";

describe("folder contracts", () => {
  it("defaults create placement while rejecting server-owned fields", () => {
    expect(createFolderRequestSchema.parse({ name: " Work " })).toEqual({
      name: "Work",
      placement: { kind: "end" },
    });

    for (const forbidden of ["id", "userId", "rank", "version", "createdAt", "updatedAt", "deletedAt"]) {
      expect(() => createFolderRequestSchema.parse({ name: "Work", [forbidden]: id })).toThrow();
    }
  });

  it("requires nonempty updates, positive versions, and closed placement", () => {
    expect(updateFolderRequestSchema.parse({ expectedVersion: 2, patch: { name: "Home" } })).toEqual({
      expectedVersion: 2,
      patch: { name: "Home" },
    });
    expect(
      positionFolderRequestSchema.parse({ expectedVersion: 2, placement: { kind: "start" } }),
    ).toBeTruthy();
    expect(deleteFolderRequestSchema.parse({ expectedVersion: 2 })).toEqual({ expectedVersion: 2 });
    expect(() => updateFolderRequestSchema.parse({ expectedVersion: 2, patch: {} })).toThrow();
    expect(() => deleteFolderRequestSchema.parse({ expectedVersion: 2, force: true })).toThrow();
  });

  it("validates strict response and bounded query contracts", () => {
    const dto = {
      id,
      name: "Work",
      rank: "a0",
      version: 1,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    };
    expect(folderDtoSchema.parse(dto)).toEqual(dto);
    expect(() => folderDtoSchema.parse({ ...dto, userId: otherId })).toThrow();
    expect(folderQuerySchema.parse({ limit: "50" })).toEqual({ limit: 50 });
  });
});

describe("regular-list contracts", () => {
  it("accepts only regular-list create fields and approved colors", () => {
    expect(createRegularListRequestSchema.parse({ name: "Launch", colorToken: "coral" })).toEqual({
      name: "Launch",
      colorToken: "coral",
      folderId: null,
      placement: { kind: "end" },
    });
    expect(
      createRegularListRequestSchema.parse({
        name: "Launch",
        colorToken: "sky",
        folderId: id,
        placement: { kind: "before", anchorId: otherId },
      }),
    ).toMatchObject({ folderId: id });

    for (const forbidden of ["id", "userId", "kind", "rank", "version", "createdAt", "deletedAt"]) {
      expect(() =>
        createRegularListRequestSchema.parse({ name: "Launch", colorToken: "coral", [forbidden]: id }),
      ).toThrow();
    }
    expect(() => createRegularListRequestSchema.parse({ name: "Launch", colorToken: "red" })).toThrow();
  });

  it("separates field edits, moves, deletion disposition, and query pagination", () => {
    expect(
      updateRegularListRequestSchema.parse({ expectedVersion: 1, patch: { colorToken: "mint" } }),
    ).toBeTruthy();
    expect(() => updateRegularListRequestSchema.parse({ expectedVersion: 1, patch: {} })).toThrow();
    expect(
      moveRegularListRequestSchema.parse({
        expectedVersion: 2,
        folderId: null,
        placement: { kind: "after", anchorId: otherId },
      }),
    ).toBeTruthy();
    expect(deleteRegularListRequestSchema.parse({ expectedVersion: 2, moveTasksToListId: otherId })).toEqual({
      expectedVersion: 2,
      moveTasksToListId: otherId,
    });
    expect(regularListQuerySchema.parse({})).toEqual({ limit: 50 });
  });

  it("exposes kind and rank only in strict server DTOs", () => {
    const dto = {
      id,
      folderId: null,
      name: "Launch",
      colorToken: "coral",
      rank: "a0",
      kind: "regular",
      version: 1,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    };
    expect(regularListDtoSchema.parse(dto)).toEqual(dto);
    expect(() => regularListDtoSchema.parse({ ...dto, kind: "inbox" })).toThrow();
    expect(() => regularListDtoSchema.parse({ ...dto, userId: id })).toThrow();
  });
});

describe("section contracts", () => {
  it("keeps the parent list in the path rather than the create body", () => {
    expect(createSectionRequestSchema.parse({ name: "Next" })).toEqual({
      name: "Next",
      placement: { kind: "end" },
    });
    expect(() => createSectionRequestSchema.parse({ name: "Next", listId: id })).toThrow();
  });

  it("validates update, position, hard-delete, response, and query shapes", () => {
    expect(updateSectionRequestSchema.parse({ expectedVersion: 1, patch: { name: "Doing" } })).toBeTruthy();
    expect(() => updateSectionRequestSchema.parse({ expectedVersion: 1, patch: {} })).toThrow();
    expect(
      positionSectionRequestSchema.parse({ expectedVersion: 1, placement: { kind: "before", anchorId: id } }),
    ).toBeTruthy();
    expect(deleteSectionRequestSchema.parse({ expectedVersion: 1 })).toEqual({ expectedVersion: 1 });

    const dto = {
      id,
      listId: otherId,
      name: "Next",
      rank: "a0",
      version: 1,
      createdAt,
      updatedAt: createdAt,
    };
    expect(sectionDtoSchema.parse(dto)).toEqual(dto);
    expect(() => sectionDtoSchema.parse({ ...dto, deletedAt: null })).toThrow();
    expect(sectionQuerySchema.parse({ cursor: "next_1" })).toEqual({ cursor: "next_1", limit: 50 });
  });
});
