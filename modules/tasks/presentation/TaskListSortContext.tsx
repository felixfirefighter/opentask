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

type SortableTask = Readonly<{ id: string; title: string }>;

export function TaskListSortContext({
  children,
  disabled,
  dndId,
  onMove,
  tasks,
}: Readonly<{
  children: ReactNode;
  disabled: boolean;
  dndId: string;
  onMove: (activeId: string, overId: string) => void;
  tasks: readonly SortableTask[];
}>) {
  const [announcement, setAnnouncement] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function taskLabel(id: string | number) {
    return tasks.find((task) => task.id === String(id))?.title ?? "Task";
  }

  function positionLabel(id: string | number) {
    const index = tasks.findIndex((task) => task.id === String(id));
    return index < 0 ? "its original position" : `position ${index + 1} of ${tasks.length}`;
  }

  function handleDragStart(event: DragStartEvent) {
    setAnnouncement(`${taskLabel(event.active.id)} picked up at ${positionLabel(event.active.id)}.`);
  }

  function handleDragOver(event: DragOverEvent) {
    if (event.over && event.over.id !== event.active.id) {
      setAnnouncement(`${taskLabel(event.active.id)} moved to ${positionLabel(event.over.id)}.`);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    if (disabled) {
      setAnnouncement(
        `${taskLabel(event.active.id)} returned to its previous position. Reconnect to reorder.`,
      );
      return;
    }
    setAnnouncement(
      event.over
        ? `${taskLabel(event.active.id)} dropped at ${positionLabel(event.over.id)}.`
        : `${taskLabel(event.active.id)} returned to its original position.`,
    );
    if (event.over && event.active.id !== event.over.id) {
      onMove(String(event.active.id), String(event.over.id));
    }
  }

  function handleDragCancel(event: DragCancelEvent) {
    setAnnouncement(
      `${taskLabel(event.active.id)} reorder cancelled and returned to ${positionLabel(event.active.id)}.`,
    );
  }

  return (
    <DndContext
      id={dndId}
      accessibility={{
        announcements: {
          onDragStart: () => undefined,
          onDragOver: () => undefined,
          onDragEnd: () => undefined,
          onDragCancel: () => undefined,
        },
        screenReaderInstructions: {
          draggable:
            "To reorder a task, press Space to pick it up, use the arrow keys to move it, press Space to drop, or Escape to cancel.",
        },
      }}
      collisionDetection={closestCenter}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </DndContext>
  );
}
