"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useState, type ReactNode } from "react";

type SortItem = Readonly<{ id: string; label: string }>;

export function TaskStepSortContext({
  children,
  disabled,
  items,
  onMove,
}: Readonly<{
  children: ReactNode;
  disabled: boolean;
  items: readonly SortItem[];
  onMove: (activeId: string, overId: string) => void;
}>) {
  const [announcement, setAnnouncement] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const labels = new Map(items.map((item) => [item.id, item.label] as const));

  function itemLabel(id: string | number) {
    return labels.get(String(id)) ?? "Item";
  }

  function positionLabel(id: string | number) {
    const index = items.findIndex((item) => item.id === String(id));
    return index < 0 ? "" : `position ${index + 1} of ${items.length}`;
  }

  function handleDragStart(event: DragStartEvent) {
    setAnnouncement(`${itemLabel(event.active.id)} picked up at ${positionLabel(event.active.id)}.`);
  }

  function handleDragOver(event: DragOverEvent) {
    if (event.over && event.over.id !== event.active.id) {
      setAnnouncement(`${itemLabel(event.active.id)} moved to ${positionLabel(event.over.id)}.`);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    if (disabled) {
      setAnnouncement(
        `${itemLabel(event.active.id)} returned to its previous position. Reconnect to reorder.`,
      );
      return;
    }
    setAnnouncement(
      event.over
        ? `${itemLabel(event.active.id)} dropped at ${positionLabel(event.over.id)}.`
        : `${itemLabel(event.active.id)} returned to its original position.`,
    );
    if (!event.over || event.active.id === event.over.id) return;
    onMove(String(event.active.id), String(event.over.id));
  }

  function handleDragCancel(event: DragCancelEvent) {
    setAnnouncement(
      `${itemLabel(event.active.id)} reorder cancelled and returned to ${positionLabel(event.active.id)}.`,
    );
  }

  return (
    <DndContext
      accessibility={{
        announcements: {
          onDragStart: () => undefined,
          onDragOver: () => undefined,
          onDragEnd: () => undefined,
          onDragCancel: () => undefined,
        },
        screenReaderInstructions: {
          draggable:
            "To reorder, press Space to pick up, use the arrow keys to move, press Space to drop, or Escape to cancel.",
        },
      }}
      collisionDetection={closestCenter}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </DndContext>
  );
}
