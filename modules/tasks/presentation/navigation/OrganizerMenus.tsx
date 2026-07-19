"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";

import type { FolderDto, Placement, RegularListDto } from "../../application/contracts";
import styles from "./OrganizerMenus.module.css";

export function FolderMenu({
  disabled,
  folder,
  folders,
  onCreateList,
  onDelete,
  onMove,
  onRename,
}: Readonly<{
  disabled: boolean;
  folder: FolderDto;
  folders: readonly FolderDto[];
  onCreateList: () => void;
  onDelete: () => void;
  onMove: (placement: Placement) => void;
  onRename: () => void;
}>) {
  const index = folders.findIndex((candidate) => candidate.id === folder.id);
  const previous = folders[index - 1];
  const next = folders[index + 1];

  return (
    <OrganizerMenuTrigger label={`Open actions for folder ${folder.name}`} disabled={disabled}>
      <DropdownMenu.Item className={styles.item} disabled={disabled} onSelect={onCreateList}>
        Create list here
      </DropdownMenu.Item>
      <DropdownMenu.Item className={styles.item} disabled={disabled} onSelect={onRename}>
        Rename folder
      </DropdownMenu.Item>
      <DropdownMenu.Separator className={styles.separator} />
      <DropdownMenu.Item
        className={styles.item}
        disabled={disabled || !previous}
        onSelect={() => previous && onMove({ kind: "before", anchorId: previous.id })}
      >
        Move folder up
      </DropdownMenu.Item>
      <DropdownMenu.Item
        className={styles.item}
        disabled={disabled || !next}
        onSelect={() => next && onMove({ kind: "after", anchorId: next.id })}
      >
        Move folder down
      </DropdownMenu.Item>
      <DropdownMenu.Separator className={styles.separator} />
      <DropdownMenu.Item
        className={`${styles.item} ${styles.danger}`}
        disabled={disabled}
        onSelect={onDelete}
      >
        Delete folder…
      </DropdownMenu.Item>
    </OrganizerMenuTrigger>
  );
}

export function ListMenu({
  disabled,
  folders,
  list,
  lists,
  onDelete,
  onMove,
  onRename,
}: Readonly<{
  disabled: boolean;
  folders: readonly FolderDto[];
  list: RegularListDto;
  lists: readonly RegularListDto[];
  onDelete: () => void;
  onMove: (folderId: string | null, placement: Placement) => void;
  onRename: () => void;
}>) {
  const siblings = lists.filter((candidate) => candidate.folderId === list.folderId);
  const index = siblings.findIndex((candidate) => candidate.id === list.id);
  const previous = siblings[index - 1];
  const next = siblings[index + 1];

  return (
    <OrganizerMenuTrigger label={`Open actions for list ${list.name}`} disabled={disabled}>
      <DropdownMenu.Item className={styles.item} disabled={disabled} onSelect={onRename}>
        Rename list
      </DropdownMenu.Item>
      <DropdownMenu.Item
        className={styles.item}
        disabled={disabled || !previous}
        onSelect={() => previous && onMove(list.folderId, { kind: "before", anchorId: previous.id })}
      >
        Move list up
      </DropdownMenu.Item>
      <DropdownMenu.Item
        className={styles.item}
        disabled={disabled || !next}
        onSelect={() => next && onMove(list.folderId, { kind: "after", anchorId: next.id })}
      >
        Move list down
      </DropdownMenu.Item>
      <DropdownMenu.Sub>
        <DropdownMenu.SubTrigger className={styles.item} disabled={disabled}>
          Move to folder
          <ChevronRight className={styles.chevron} size={16} aria-hidden="true" />
        </DropdownMenu.SubTrigger>
        <DropdownMenu.Portal>
          <DropdownMenu.SubContent className={styles.content} sideOffset={4}>
            <DropdownMenu.Item
              className={styles.item}
              disabled={disabled || list.folderId === null}
              onSelect={() => onMove(null, { kind: "end" })}
            >
              No folder
            </DropdownMenu.Item>
            {folders.map((folder) => (
              <DropdownMenu.Item
                className={styles.item}
                disabled={disabled || list.folderId === folder.id}
                key={folder.id}
                onSelect={() => onMove(folder.id, { kind: "end" })}
              >
                {folder.name}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.SubContent>
        </DropdownMenu.Portal>
      </DropdownMenu.Sub>
      <DropdownMenu.Separator className={styles.separator} />
      <DropdownMenu.Item
        className={`${styles.item} ${styles.danger}`}
        disabled={disabled}
        onSelect={onDelete}
      >
        Delete list…
      </DropdownMenu.Item>
    </OrganizerMenuTrigger>
  );
}

function OrganizerMenuTrigger({
  children,
  disabled,
  label,
}: Readonly<{
  children: ReactNode;
  disabled: boolean;
  label: string;
}>) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={disabled}>
        <button
          className={styles.trigger}
          type="button"
          aria-label={label}
          data-organizer-menu-trigger
          title={label}
        >
          <MoreHorizontal size={17} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.content} align="start" sideOffset={4}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
