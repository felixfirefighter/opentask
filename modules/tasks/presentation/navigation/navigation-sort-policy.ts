import type { FolderDto, Placement, RegularListDto } from "../../application/contracts";

export type NavigationDropIntent =
  | Readonly<{ kind: "folder"; folder: FolderDto; placement: Placement }>
  | Readonly<{
      kind: "list";
      folderId: string | null;
      list: RegularListDto;
      placement: Placement;
    }>;

export function folderSortId(folderId: string) {
  return `folder:${folderId}`;
}

export function listSortId(listId: string) {
  return `list:${listId}`;
}

export function isCompatibleNavigationDrop(
  activeId: string,
  overId: string,
  folders: readonly FolderDto[],
  lists: readonly RegularListDto[],
) {
  const activeFolder = folderBySortId(activeId, folders);
  if (activeFolder) return Boolean(folderBySortId(overId, folders));

  const activeList = listBySortId(activeId, lists);
  const overList = listBySortId(overId, lists);
  return Boolean(activeList && overList && activeList.folderId === overList.folderId);
}

export function resolveNavigationDrop(
  activeId: string,
  overId: string,
  folders: readonly FolderDto[],
  lists: readonly RegularListDto[],
): NavigationDropIntent | null {
  if (activeId === overId || !isCompatibleNavigationDrop(activeId, overId, folders, lists)) return null;

  const folder = folderBySortId(activeId, folders);
  const folderAnchor = folderBySortId(overId, folders);
  if (folder && folderAnchor) {
    return {
      kind: "folder",
      folder,
      placement: relativePlacement(
        folders.findIndex((candidate) => candidate.id === folder.id),
        folders.findIndex((candidate) => candidate.id === folderAnchor.id),
        folderAnchor.id,
      ),
    };
  }

  const list = listBySortId(activeId, lists);
  const listAnchor = listBySortId(overId, lists);
  if (!list || !listAnchor) return null;
  const siblings = lists.filter((candidate) => candidate.folderId === list.folderId);
  return {
    kind: "list",
    folderId: list.folderId,
    list,
    placement: relativePlacement(
      siblings.findIndex((candidate) => candidate.id === list.id),
      siblings.findIndex((candidate) => candidate.id === listAnchor.id),
      listAnchor.id,
    ),
  };
}

export function navigationPosition(
  sortId: string,
  folders: readonly FolderDto[],
  lists: readonly RegularListDto[],
) {
  const folder = folderBySortId(sortId, folders);
  if (folder) return positionWithin(folder.id, folders);
  const list = listBySortId(sortId, lists);
  if (!list) return "an unavailable position";
  return positionWithin(
    list.id,
    lists.filter((candidate) => candidate.folderId === list.folderId),
  );
}

function folderBySortId(sortId: string, folders: readonly FolderDto[]) {
  if (!sortId.startsWith("folder:")) return undefined;
  return folders.find((folder) => folderSortId(folder.id) === sortId);
}

function listBySortId(sortId: string, lists: readonly RegularListDto[]) {
  if (!sortId.startsWith("list:")) return undefined;
  return lists.find((list) => listSortId(list.id) === sortId);
}

function positionWithin(id: string, items: readonly { id: string }[]) {
  const index = items.findIndex((item) => item.id === id);
  return index < 0 ? "an unavailable position" : `position ${index + 1} of ${items.length}`;
}

function relativePlacement(activeIndex: number, overIndex: number, anchorId: string): Placement {
  return activeIndex < overIndex ? { kind: "after", anchorId } : { kind: "before", anchorId };
}
