"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import type { FolderDto, RegularListDto } from "../../application/contracts";
import styles from "../TaskNavigation.module.css";
import { folderSortId, listSortId } from "./navigation-sort-policy";

export function SortableFolder({
  children,
  disabled,
  folder,
}: Readonly<{ children: (handle: ReactNode) => ReactNode; disabled: boolean; folder: FolderDto }>) {
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef, transform } = useSortable({
    id: folderSortId(folder.id),
    disabled,
  });
  return (
    <li
      ref={setNodeRef}
      className={styles.sortableItem}
      data-dragging={isDragging}
      style={sortableStyle(transform)}
    >
      {children(
        <DragHandle
          attributes={attributes}
          disabled={disabled}
          label={`Reorder folder ${folder.name}`}
          listeners={listeners}
          setActivatorNodeRef={setActivatorNodeRef}
        />,
      )}
    </li>
  );
}

export function SortableList({
  children,
  disabled,
  list,
}: Readonly<{ children: (handle: ReactNode) => ReactNode; disabled: boolean; list: RegularListDto }>) {
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef, transform } = useSortable({
    id: listSortId(list.id),
    disabled,
  });
  return (
    <li
      ref={setNodeRef}
      className={styles.sortableItem}
      data-dragging={isDragging}
      style={sortableStyle(transform)}
    >
      {children(
        <DragHandle
          attributes={attributes}
          disabled={disabled}
          label={`Reorder list ${list.name}`}
          listeners={listeners}
          setActivatorNodeRef={setActivatorNodeRef}
        />,
      )}
    </li>
  );
}

function DragHandle({
  attributes,
  disabled,
  label,
  listeners,
  setActivatorNodeRef,
}: Readonly<{
  attributes: ReturnType<typeof useSortable>["attributes"];
  disabled: boolean;
  label: string;
  listeners: ReturnType<typeof useSortable>["listeners"];
  setActivatorNodeRef: ReturnType<typeof useSortable>["setActivatorNodeRef"];
}>) {
  return (
    <button
      ref={setActivatorNodeRef}
      className={styles.dragHandle}
      type="button"
      disabled={disabled}
      aria-label={label}
      title={label}
      {...attributes}
      {...listeners}
    >
      <GripVertical size={15} aria-hidden="true" />
    </button>
  );
}

function sortableStyle(transform: ReturnType<typeof useSortable>["transform"]): CSSProperties {
  return { transform: CSS.Transform.toString(transform) };
}
