"use client";

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { FolderDto, Placement, RegularListDto } from "../../application/contracts";
import styles from "../TaskNavigation.module.css";
import { listSortId } from "./navigation-sort-policy";
import { ListMenu } from "./OrganizerMenus";
import { SortableList } from "./TaskNavigationSortables";
import type { TaskNavigationCurrent } from "./TaskNavigationTree";

export function DestinationLink({
  children,
  current,
  href,
  icon,
  onNavigate,
}: Readonly<{
  children: ReactNode;
  current: boolean;
  href: string;
  icon: ReactNode;
  onNavigate: () => void;
}>) {
  return (
    <li>
      <Link
        className={styles.destinationLink}
        href={href}
        aria-current={current ? "page" : undefined}
        onClick={onNavigate}
      >
        <span aria-hidden="true">{icon}</span>
        <span>{children}</span>
      </Link>
    </li>
  );
}

export function ListGroup({
  allLists,
  current,
  disabled,
  folders,
  lists,
  onDelete,
  onMove,
  onNavigate,
  onRename,
  reorderDisabled = disabled,
}: Readonly<{
  allLists: readonly RegularListDto[];
  current: TaskNavigationCurrent;
  disabled: boolean;
  folders: readonly FolderDto[];
  lists: readonly RegularListDto[];
  onDelete: (list: RegularListDto) => void;
  onMove: (list: RegularListDto, folderId: string | null, placement: Placement) => void;
  onNavigate: () => void;
  onRename: (list: RegularListDto) => void;
  reorderDisabled?: boolean;
}>) {
  return (
    <SortableContext items={lists.map((list) => listSortId(list.id))} strategy={verticalListSortingStrategy}>
      <ul className={styles.listGroup}>
        {lists.map((list) => (
          <SortableList disabled={reorderDisabled} key={list.id} list={list}>
            {(dragHandle) => (
              <div className={styles.listRow}>
                <Link
                  className={styles.listLink}
                  href={`/lists/${list.id}`}
                  aria-current={
                    typeof current === "object" && current.listId === list.id ? "page" : undefined
                  }
                  onClick={onNavigate}
                >
                  <span className={styles.listAccent} data-color={list.colorToken} aria-hidden="true" />
                  <span>{list.name}</span>
                </Link>
                {dragHandle}
                <ListMenu
                  disabled={disabled}
                  folders={folders}
                  list={list}
                  lists={allLists}
                  onDelete={() => onDelete(list)}
                  onMove={(folderId, placement) => onMove(list, folderId, placement)}
                  onRename={() => onRename(list)}
                />
              </div>
            )}
          </SortableList>
        ))}
      </ul>
    </SortableContext>
  );
}

export function CreateButton({
  disabled,
  label,
  onClick,
}: Readonly<{ disabled: boolean; label: string; onClick: () => void }>) {
  return (
    <button
      className={styles.createButton}
      type="button"
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Plus size={16} aria-hidden="true" />
    </button>
  );
}
