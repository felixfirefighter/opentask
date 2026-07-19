"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useOnlineStatus } from "@/shared/presentation";

import type { FolderDto, RegularListDto } from "../application/contracts";
import { isTaskApiError } from "./data/task-api-request";
import { useOrganizerMutations } from "./data/use-organizer-mutations";
import { useFoldersQuery, useRegularListsQuery } from "./data/use-organizer-queries";
import { TaskNavigationContent } from "./navigation/TaskNavigationContent";
import { OrganizerDeleteDialog, type OrganizerDeleteTarget } from "./navigation/OrganizerDeleteDialog";
import {
  OrganizerDialog,
  type OrganizerEditor,
  type OrganizerEditorValues,
} from "./navigation/OrganizerDialog";
import { CompactTaskNavigation } from "./navigation/TaskNavigationOverlays";
import type { TaskNavigationCurrent } from "./navigation/TaskNavigationTree";

export type { TaskNavigationCurrent } from "./navigation/TaskNavigationTree";

export function TaskNavigation({
  current,
  inboxId,
  variant = "sidebar",
}: Readonly<{
  current: TaskNavigationCurrent;
  inboxId: string;
  variant?: "compact" | "sidebar";
}>) {
  const online = useOnlineStatus();
  const router = useRouter();
  const foldersQuery = useFoldersQuery();
  const listsQuery = useRegularListsQuery();
  const organizer = useOrganizerMutations(inboxId);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editor, setEditor] = useState<OrganizerEditor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrganizerDeleteTarget | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const folders = foldersQuery.folders;
  const lists = listsQuery.lists;
  const activeEditor = currentEditor(editor, folders, lists);
  const activeDeleteTarget = currentDeleteTarget(deleteTarget, folders, lists);
  const disabled = !online || organizer.isPending;

  async function runAction(action: () => Promise<unknown>) {
    setActionError(null);
    if (!online || organizer.isPending) {
      setActionError(
        online
          ? "Wait for the current navigation change to finish."
          : "Reconnect before changing navigation.",
      );
      return false;
    }
    try {
      await action();
      return true;
    } catch (error) {
      setActionError(organizerErrorMessage(error));
      return false;
    }
  }

  function openEditor(nextEditor: OrganizerEditor) {
    setActionError(null);
    setDrawerOpen(false);
    setEditor(nextEditor);
  }

  function openDelete(nextTarget: OrganizerDeleteTarget) {
    setActionError(null);
    setDrawerOpen(false);
    setDeleteTarget(nextTarget);
  }

  const navigation = (
    <TaskNavigationContent
      actionError={actionError}
      current={current}
      disabled={disabled}
      folders={folders}
      foldersQuery={foldersQuery}
      lists={lists}
      listsQuery={listsQuery}
      offline={!online}
      onCreateFolder={() => openEditor({ kind: "create-folder" })}
      onCreateList={(folderId) => openEditor({ kind: "create-list", folderId })}
      onDeleteFolder={(folder) => openDelete({ kind: "folder", folder })}
      onDeleteList={(list) => openDelete({ kind: "list", list })}
      onMoveFolder={(folder, placement) => void runAction(() => organizer.moveFolder({ folder, placement }))}
      onMoveList={(list, folderId, placement) =>
        void runAction(() => organizer.moveList({ folderId, list, placement }))
      }
      onNavigate={() => setDrawerOpen(false)}
      onRenameFolder={(folder) => openEditor({ kind: "rename-folder", folder })}
      onRenameList={(list) => openEditor({ kind: "rename-list", list })}
    />
  );

  return (
    <>
      {variant === "compact" ? (
        <CompactTaskNavigation open={drawerOpen} onOpenChange={setDrawerOpen}>
          {navigation}
        </CompactTaskNavigation>
      ) : (
        navigation
      )}
      <OrganizerDialog
        disabled={!online}
        editor={activeEditor}
        errorMessage={actionError}
        folders={folders}
        isPending={organizer.isPending}
        onDismiss={() => setEditor(null)}
        onSubmit={(activeEditor, values) => submitEditor(activeEditor, values, organizer, runAction)}
      />
      <OrganizerDeleteDialog
        disabled={!online}
        errorMessage={actionError}
        isPending={organizer.isPending}
        onConfirm={async (target) => {
          const deleted = await runAction(() =>
            target.kind === "folder"
              ? organizer.deleteFolder(target.folder)
              : organizer.deleteList(target.list),
          );
          if (
            deleted &&
            target.kind === "list" &&
            typeof current === "object" &&
            current.listId === target.list.id
          )
            router.push("/inbox");
          return deleted;
        }}
        onDismiss={() => setDeleteTarget(null)}
        target={activeDeleteTarget}
      />
    </>
  );
}

async function submitEditor(
  editor: OrganizerEditor,
  values: OrganizerEditorValues,
  organizer: ReturnType<typeof useOrganizerMutations>,
  runAction: (action: () => Promise<unknown>) => Promise<boolean>,
) {
  const name = values.name.trim();
  if (editor.kind === "create-folder")
    return runAction(() => organizer.createFolder({ name, resourceId: values.resourceId }));
  if (editor.kind === "create-list")
    return runAction(() =>
      organizer.createList({
        colorToken: values.colorToken,
        folderId: values.folderId,
        name,
        resourceId: values.resourceId,
      }),
    );
  if (editor.kind === "rename-folder")
    return runAction(() => organizer.renameFolder({ folder: editor.folder, name }));
  return runAction(() => organizer.renameList({ list: editor.list, name, colorToken: values.colorToken }));
}

function currentEditor(
  editor: OrganizerEditor | null,
  folders: readonly FolderDto[],
  lists: readonly RegularListDto[],
): OrganizerEditor | null {
  if (editor?.kind === "rename-folder")
    return { ...editor, folder: folders.find((folder) => folder.id === editor.folder.id) ?? editor.folder };
  if (editor?.kind === "rename-list")
    return { ...editor, list: lists.find((list) => list.id === editor.list.id) ?? editor.list };
  return editor;
}

function currentDeleteTarget(
  target: OrganizerDeleteTarget | null,
  folders: readonly FolderDto[],
  lists: readonly RegularListDto[],
): OrganizerDeleteTarget | null {
  if (target?.kind === "folder")
    return { ...target, folder: folders.find((folder) => folder.id === target.folder.id) ?? target.folder };
  if (target?.kind === "list")
    return { ...target, list: lists.find((list) => list.id === target.list.id) ?? target.list };
  return target;
}

function organizerErrorMessage(error: unknown) {
  if (isTaskApiError(error) && error.code === "CONFLICT")
    return "This item changed elsewhere. Navigation refreshed; review it and try again.";
  if (isTaskApiError(error) && error.code === "VALIDATION_FAILED")
    return "That change is not valid. Review the fields and try again.";
  return "Changes were not saved. Check your connection and try again.";
}
