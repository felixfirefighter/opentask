"use client";

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CheckCircle2, ChevronDown, ChevronRight, Folder, Inbox } from "lucide-react";
import { useState } from "react";

import type { FolderDto, Placement, RegularListDto } from "../../application/contracts";
import { CreateButton, DestinationLink, ListGroup } from "./TaskNavigationItems";
import { FolderMenu } from "./OrganizerMenus";
import { folderSortId } from "./navigation-sort-policy";
import { SortableFolder } from "./TaskNavigationSortables";
import styles from "../TaskNavigation.module.css";

export type TaskNavigationCurrent = "inbox" | "completed" | Readonly<{ listId: string }>;

export function TaskNavigationTree({
  current,
  disabled,
  folders,
  lists,
  onCreateFolder,
  onCreateList,
  onDeleteFolder,
  onDeleteList,
  onMoveFolder,
  onMoveList,
  onNavigate,
  onRenameFolder,
  onRenameList,
}: Readonly<{
  current: TaskNavigationCurrent;
  disabled: boolean;
  folders: readonly FolderDto[];
  lists: readonly RegularListDto[];
  onCreateFolder: () => void;
  onCreateList: (folderId: string | null) => void;
  onDeleteFolder: (folder: FolderDto) => void;
  onDeleteList: (list: RegularListDto) => void;
  onMoveFolder: (folder: FolderDto, placement: Placement) => void;
  onMoveList: (list: RegularListDto, folderId: string | null, placement: Placement) => void;
  onNavigate: () => void;
  onRenameFolder: (folder: FolderDto) => void;
  onRenameList: (list: RegularListDto) => void;
}>) {
  const [collapsedFolders, setCollapsedFolders] = useState<ReadonlySet<string>>(new Set());
  const knownFolderIds = new Set(folders.map((folder) => folder.id));
  const unfiledLists = lists.filter((list) => list.folderId === null);
  const unavailableFolderLists = lists.filter(
    (list) => list.folderId !== null && !knownFolderIds.has(list.folderId),
  );
  function toggleFolder(folderId: string) {
    setCollapsedFolders((currentCollapsed) => {
      const next = new Set(currentCollapsed);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  return (
    <nav className={styles.navigation} aria-label="Task destinations">
      <ul className={styles.destinationList}>
        <DestinationLink
          current={current === "inbox"}
          href="/inbox"
          icon={<Inbox size={17} />}
          onNavigate={onNavigate}
        >
          Inbox
        </DestinationLink>
        <DestinationLink
          current={current === "completed"}
          href="/completed"
          icon={<CheckCircle2 size={17} />}
          onNavigate={onNavigate}
        >
          Completed / cancelled
        </DestinationLink>
      </ul>

      <div className={styles.sectionHeading}>
        <span>My lists</span>
        <span className={styles.headingActions}>
          <CreateButton disabled={disabled} label="Create folder" onClick={onCreateFolder} />
          <CreateButton disabled={disabled} label="Create list" onClick={() => onCreateList(null)} />
        </span>
      </div>

      {folders.length === 0 && lists.length === 0 ? (
        <div className={styles.emptyNavigation}>
          <p>No lists yet.</p>
          <button type="button" disabled={disabled} onClick={() => onCreateList(null)}>
            Create list
          </button>
        </div>
      ) : null}

      <SortableContext
        items={folders.map((folder) => folderSortId(folder.id))}
        strategy={verticalListSortingStrategy}
      >
        <ul className={styles.groupList}>
          {folders.map((folder) => {
            const folderLists = lists.filter((list) => list.folderId === folder.id);
            const expanded = !collapsedFolders.has(folder.id);
            return (
              <SortableFolder disabled={disabled} folder={folder} key={folder.id}>
                {(dragHandle) => (
                  <>
                    <div className={styles.folderRow}>
                      <button
                        className={styles.disclosure}
                        type="button"
                        aria-expanded={expanded}
                        aria-label={`${expanded ? "Collapse" : "Expand"} folder ${folder.name}`}
                        onClick={() => toggleFolder(folder.id)}
                      >
                        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                      <Folder size={16} aria-hidden="true" />
                      <span className={styles.folderName}>{folder.name}</span>
                      {dragHandle}
                      <FolderMenu
                        disabled={disabled}
                        folder={folder}
                        folders={folders}
                        onCreateList={() => onCreateList(folder.id)}
                        onDelete={() => onDeleteFolder(folder)}
                        onMove={(placement) => onMoveFolder(folder, placement)}
                        onRename={() => onRenameFolder(folder)}
                      />
                    </div>
                    {expanded ? (
                      <ListGroup
                        current={current}
                        disabled={disabled}
                        folders={folders}
                        lists={folderLists}
                        allLists={lists}
                        onDelete={onDeleteList}
                        onMove={onMoveList}
                        onNavigate={onNavigate}
                        onRename={onRenameList}
                      />
                    ) : null}
                  </>
                )}
              </SortableFolder>
            );
          })}
        </ul>
      </SortableContext>

      {unfiledLists.length > 0 ? (
        <section className={styles.unfiledSection} aria-labelledby="unfiled-lists-title">
          <h3 id="unfiled-lists-title">Lists</h3>
          <ListGroup
            current={current}
            disabled={disabled}
            folders={folders}
            lists={unfiledLists}
            allLists={lists}
            onDelete={onDeleteList}
            onMove={onMoveList}
            onNavigate={onNavigate}
            onRename={onRenameList}
          />
        </section>
      ) : null}

      {unavailableFolderLists.length > 0 ? (
        <section className={styles.unfiledSection} aria-labelledby="unavailable-folder-lists-title">
          <h3 id="unavailable-folder-lists-title">Lists with unavailable folders</h3>
          <p className={styles.fallbackDescription}>
            Folder details are unavailable. Open a list or use its menu to organize it.
          </p>
          <ListGroup
            current={current}
            disabled={disabled}
            folders={folders}
            lists={unavailableFolderLists}
            allLists={lists}
            onDelete={onDeleteList}
            onMove={onMoveList}
            onNavigate={onNavigate}
            onRename={onRenameList}
            reorderDisabled
          />
        </section>
      ) : null}
    </nav>
  );
}
