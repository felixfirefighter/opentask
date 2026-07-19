"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { ReactNode } from "react";

import type { FolderDto, Placement, RegularListDto } from "../../application/contracts";
import {
  folderSortId,
  isCompatibleNavigationDrop,
  listSortId,
  navigationPosition,
  resolveNavigationDrop,
} from "./navigation-sort-policy";

export function TaskNavigationSortContext({
  children,
  disabled,
  folders,
  lists,
  onMoveFolder,
  onMoveList,
}: Readonly<{
  children: ReactNode;
  disabled: boolean;
  folders: readonly FolderDto[];
  lists: readonly RegularListDto[];
  onMoveFolder: (folder: FolderDto, placement: Placement) => void;
  onMoveList: (list: RegularListDto, folderId: string | null, placement: Placement) => void;
}>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const labels = new Map<string, string>([
    ...folders.map((folder) => [folderSortId(folder.id), `Folder ${folder.name}`] as const),
    ...lists.map((list) => [listSortId(list.id), `List ${list.name}`] as const),
  ]);

  const collisionDetection: CollisionDetection = (args) =>
    closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(({ id }) =>
        isCompatibleNavigationDrop(String(args.active.id), String(id), folders, lists),
      ),
    });

  function handleDragEnd(event: DragEndEvent) {
    if (disabled || !event.over) return;
    const intent = resolveNavigationDrop(String(event.active.id), String(event.over.id), folders, lists);
    if (intent?.kind === "folder") onMoveFolder(intent.folder, intent.placement);
    if (intent?.kind === "list") onMoveList(intent.list, intent.folderId, intent.placement);
  }

  return (
    <DndContext
      accessibility={{
        announcements: {
          onDragStart: ({ active }) =>
            `${labels.get(String(active.id)) ?? "Item"} picked up at ${navigationPosition(String(active.id), folders, lists)}.`,
          onDragOver: ({ active, over }) =>
            over
              ? `${labels.get(String(active.id)) ?? "Item"} moved to ${navigationPosition(String(over.id), folders, lists)}.`
              : undefined,
          onDragEnd: ({ active, over }) =>
            over
              ? `${labels.get(String(active.id)) ?? "Item"} dropped at ${navigationPosition(String(over.id), folders, lists)}.`
              : `${labels.get(String(active.id)) ?? "Item"} returned to its original position.`,
          onDragCancel: ({ active }) => `${labels.get(String(active.id)) ?? "Item"} reorder cancelled.`,
        },
        screenReaderInstructions: {
          draggable:
            "To reorder, press Space to pick up, use the arrow keys to move, press Space to drop, or Escape to cancel.",
        },
      }}
      collisionDetection={collisionDetection}
      onDragEnd={handleDragEnd}
      sensors={sensors}
    >
      {children}
    </DndContext>
  );
}
