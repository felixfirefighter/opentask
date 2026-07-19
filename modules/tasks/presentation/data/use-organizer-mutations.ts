"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { ColorToken, FolderDto, Placement, RegularListDto } from "../../application/contracts";
import {
  createFolder,
  createRegularList,
  deleteFolder,
  deleteRegularList,
  getFolder,
  getRegularList,
  moveRegularList,
  positionFolder,
  restoreFolder,
  restoreRegularList,
  updateFolder,
  updateRegularList,
} from "./organizer-api-client";
import { expectedVersionForRetry } from "./expected-version-for-retry";
import { taskQueryKeys } from "./task-query-keys";

type CreateListVariables = Readonly<{
  colorToken: ColorToken;
  folderId: string | null;
  name: string;
  resourceId: string;
}>;

type MoveListVariables = Readonly<{
  folderId: string | null;
  list: RegularListDto;
  placement: Placement;
}>;

export function useOrganizerMutations(inboxId: string) {
  const queryClient = useQueryClient();
  const refreshNavigation = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: taskQueryKeys.folders() }),
      queryClient.invalidateQueries({ queryKey: taskQueryKeys.lists() }),
    ]);
  const refreshAllTasks = () => queryClient.invalidateQueries({ queryKey: taskQueryKeys.all });

  const createFolderMutation = useMutation({
    mutationFn: ({ name, resourceId }: { name: string; resourceId: string }) =>
      createFolder(resourceId, { name, placement: { kind: "end" } }),
    onSettled: refreshNavigation,
  });
  const renameFolderMutation = useMutation({
    mutationFn: ({ folder, name }: { folder: FolderDto; name: string }) =>
      updateFolder(folder.id, { expectedVersion: folder.version, patch: { name } }),
    onSettled: refreshNavigation,
  });
  const moveFolderMutation = useMutation({
    mutationFn: ({ folder, placement }: { folder: FolderDto; placement: Placement }) =>
      positionFolder(folder.id, { expectedVersion: folder.version, placement }),
    onSettled: refreshNavigation,
  });
  const deleteFolderMutation = useMutation({
    mutationFn: (folder: FolderDto) => deleteFolder(folder.id, folder.version),
    onSuccess: (deleted) => {
      toast.success("Folder deleted", {
        action: {
          label: "Undo",
          onClick: () => void undoFolderDelete(deleted.id, deleted.version, refreshNavigation),
        },
      });
    },
    onSettled: refreshNavigation,
  });

  const createListMutation = useMutation({
    mutationFn: ({ colorToken, folderId, name, resourceId }: CreateListVariables) =>
      createRegularList(resourceId, {
        colorToken,
        folderId,
        name,
        placement: { kind: "end" },
      }),
    onSettled: refreshNavigation,
  });
  const renameListMutation = useMutation({
    mutationFn: ({
      colorToken,
      list,
      name,
    }: {
      colorToken: ColorToken;
      list: RegularListDto;
      name: string;
    }) =>
      updateRegularList(list.id, {
        expectedVersion: list.version,
        patch: { name, colorToken },
      }),
    onSettled: () =>
      Promise.all([
        refreshNavigation(),
        queryClient.invalidateQueries({ queryKey: taskQueryKeys.searchRoot() }),
      ]),
  });
  const moveListMutation = useMutation({
    mutationFn: ({ folderId, list, placement }: MoveListVariables) =>
      moveRegularList(list.id, { expectedVersion: list.version, folderId, placement }),
    onSettled: refreshNavigation,
  });
  const deleteListMutation = useMutation({
    mutationFn: (list: RegularListDto) =>
      deleteRegularList(list.id, {
        expectedVersion: list.version,
        moveTasksToListId: inboxId,
      }),
    onSuccess: (deleted) => {
      toast.success("List deleted", {
        description: "Its active tasks moved to Inbox.",
        action: {
          label: "Undo",
          onClick: () => void undoListDelete(deleted.id, deleted.version, refreshAllTasks),
        },
      });
    },
    onSettled: refreshAllTasks,
  });

  return {
    createFolder: createFolderMutation.mutateAsync,
    renameFolder: renameFolderMutation.mutateAsync,
    moveFolder: moveFolderMutation.mutateAsync,
    deleteFolder: deleteFolderMutation.mutateAsync,
    createList: createListMutation.mutateAsync,
    renameList: renameListMutation.mutateAsync,
    moveList: moveListMutation.mutateAsync,
    deleteList: deleteListMutation.mutateAsync,
    isPending: [
      createFolderMutation,
      renameFolderMutation,
      moveFolderMutation,
      deleteFolderMutation,
      createListMutation,
      renameListMutation,
      moveListMutation,
      deleteListMutation,
    ].some((mutation) => mutation.isPending),
  };
}

async function undoFolderDelete(folderId: string, version: number, refresh: () => Promise<unknown>) {
  try {
    await restoreFolder(folderId, version);
  } catch (error) {
    const activeFolder = await getFolder(folderId).catch(() => null);
    await refresh().catch(() => undefined);
    if (activeFolder) {
      toast.success("Folder restored");
      return;
    }
    const retryVersion = expectedVersionForRetry(error, version);
    toast.error("Folder could not be restored", {
      description: "Navigation was refreshed. You can retry the restore safely.",
      action: {
        label: "Retry",
        onClick: () => void undoFolderDelete(folderId, retryVersion, refresh),
      },
    });
    return;
  }
  await refresh().catch(() => undefined);
  toast.success("Folder restored");
}

async function undoListDelete(listId: string, version: number, refresh: () => Promise<unknown>) {
  try {
    await restoreRegularList(listId, version);
  } catch (error) {
    const activeList = await getRegularList(listId).catch(() => null);
    await refresh().catch(() => undefined);
    if (activeList) {
      toast.success("List restored", { description: "Previously moved tasks remain in Inbox." });
      return;
    }
    const retryVersion = expectedVersionForRetry(error, version);
    toast.error("List could not be restored", {
      description: "Task lists were refreshed. You can retry the restore safely.",
      action: {
        label: "Retry",
        onClick: () => void undoListDelete(listId, retryVersion, refresh),
      },
    });
    return;
  }
  await refresh().catch(() => undefined);
  toast.success("List restored", { description: "Previously moved tasks remain in Inbox." });
}
