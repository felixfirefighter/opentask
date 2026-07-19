import { describe, expect, it } from "vitest";

import type { FolderDto, RegularListDto } from "../../application/contracts";
import {
  folderSortId,
  isCompatibleNavigationDrop,
  listSortId,
  navigationPosition,
  resolveNavigationDrop,
} from "./navigation-sort-policy";

const FOLDER_A = "11111111-1111-4111-8111-111111111111";
const FOLDER_B = "22222222-2222-4222-8222-222222222222";
const LIST_A = "33333333-3333-4333-8333-333333333333";
const LIST_B = "44444444-4444-4444-8444-444444444444";
const LIST_C = "55555555-5555-4555-8555-555555555555";

describe("navigation sort policy", () => {
  it("resolves folder drops within the folder rank scope", () => {
    const folders = [folder(FOLDER_A, "Work", "a"), folder(FOLDER_B, "Personal", "b")];

    expect(resolveNavigationDrop(folderSortId(FOLDER_A), folderSortId(FOLDER_B), folders, [])).toEqual({
      kind: "folder",
      folder: folders[0],
      placement: { kind: "after", anchorId: FOLDER_B },
    });
    expect(navigationPosition(folderSortId(FOLDER_B), folders, [])).toBe("position 2 of 2");
  });

  it("resolves list positions against siblings rather than the global list collection", () => {
    const lists = [
      list(LIST_C, FOLDER_B, "Other folder", "a"),
      list(LIST_A, FOLDER_A, "Launch", "a"),
      list(LIST_B, FOLDER_A, "Follow-up", "b"),
    ];

    expect(resolveNavigationDrop(listSortId(LIST_A), listSortId(LIST_B), [], lists)).toEqual({
      kind: "list",
      folderId: FOLDER_A,
      list: lists[1],
      placement: { kind: "after", anchorId: LIST_B },
    });
    expect(navigationPosition(listSortId(LIST_B), [], lists)).toBe("position 2 of 2");
  });

  it("rejects cross-kind, cross-folder, unknown, and no-op drops", () => {
    const folders = [folder(FOLDER_A, "Work", "a")];
    const lists = [list(LIST_A, FOLDER_A, "Launch", "a"), list(LIST_C, FOLDER_B, "Personal", "a")];

    expect(isCompatibleNavigationDrop(listSortId(LIST_A), listSortId(LIST_C), folders, lists)).toBe(false);
    expect(isCompatibleNavigationDrop(folderSortId(FOLDER_A), listSortId(LIST_A), folders, lists)).toBe(
      false,
    );
    expect(isCompatibleNavigationDrop(listSortId(LIST_A), listSortId("missing"), folders, lists)).toBe(false);
    expect(resolveNavigationDrop(listSortId(LIST_A), listSortId(LIST_A), folders, lists)).toBeNull();
  });
});

function folder(id: string, name: string, rank: string): FolderDto {
  return {
    id,
    name,
    rank,
    version: 1,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    deletedAt: null,
  };
}

function list(id: string, folderId: string | null, name: string, rank: string): RegularListDto {
  return {
    id,
    folderId,
    name,
    rank,
    colorToken: "coral",
    kind: "regular",
    version: 1,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    deletedAt: null,
  };
}
