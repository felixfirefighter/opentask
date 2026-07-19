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
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { createContext, useContext, useState, type ReactNode } from "react";

import { useOnlineStatus } from "@/shared/presentation/useOnlineStatus";

import type { SectionDto } from "../application/contracts";
import { isTaskApiError } from "./data/task-api-request";
import { useSectionMutations } from "./data/use-section-mutations";
import {
  isCompatibleSectionDrop,
  resolveSectionDrop,
  sectionLabel,
  sectionPosition,
  sectionSortId,
} from "./section-sort-policy";
import styles from "./TaskSectionControls.module.css";

const SectionSortState = createContext({ disabled: true });

export function TaskSectionSortContext({
  children,
  listId,
  sections,
}: Readonly<{
  children: ReactNode;
  listId: string;
  sections: readonly SectionDto[];
}>) {
  const online = useOnlineStatus();
  const { position } = useSectionMutations(listId);
  const [announcement, setAnnouncement] = useState("");
  const disabled = !online || position.isPending;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const collisionDetection: CollisionDetection = (args) =>
    closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(({ id }) =>
        isCompatibleSectionDrop(args.active.id, id, sections),
      ),
    });

  function handleDragStart(event: DragStartEvent) {
    position.reset();
    setAnnouncement(
      `${sectionLabel(event.active.id, sections)} picked up at ${sectionPosition(event.active.id, sections)}.`,
    );
  }

  function handleDragOver(event: DragOverEvent) {
    if (event.over && event.over.id !== event.active.id) {
      setAnnouncement(
        `${sectionLabel(event.active.id, sections)} moved to ${sectionPosition(event.over.id, sections)}.`,
      );
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    if (disabled) {
      setAnnouncement(
        `${sectionLabel(event.active.id, sections)} returned to its previous position${online ? "." : ". Reconnect to reorder."}`,
      );
      return;
    }
    if (event.over?.id === event.active.id) {
      setAnnouncement(
        `${sectionLabel(event.active.id, sections)} dropped at ${sectionPosition(event.active.id, sections)}.`,
      );
      return;
    }
    const move = resolveSectionDrop(event.active.id, event.over?.id, sections);
    if (!move) {
      setAnnouncement(`${sectionLabel(event.active.id, sections)} returned to its previous position.`);
      return;
    }
    const destination = sectionPosition(event.over!.id, sections);
    setAnnouncement(`${move.section.name} dropped at ${destination}. Saving order.`);
    position.mutate(move, {
      onSuccess: () => setAnnouncement(`${move.section.name} moved to ${destination}.`),
      onError: () => setAnnouncement(`${move.section.name} returned to its previous position.`),
    });
  }

  function handleDragCancel(event: DragCancelEvent) {
    setAnnouncement(
      `${sectionLabel(event.active.id, sections)} reorder cancelled and returned to ${sectionPosition(event.active.id, sections)}.`,
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
            "To reorder a section, press Space to pick it up, use the arrow keys to move it, press Space to drop, or Escape to cancel.",
        },
      }}
      collisionDetection={collisionDetection}
      id={`sections-${listId}`}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <SectionSortState.Provider value={{ disabled }}>
        <SortableContext
          items={sections.map((section) => sectionSortId(section.id))}
          strategy={verticalListSortingStrategy}
        >
          {children}
        </SortableContext>
      </SectionSortState.Provider>
      {position.error ? (
        <p className={styles.reorderError} role="alert">
          {isTaskApiError(position.error) && position.error.code === "CONFLICT"
            ? "A section changed elsewhere. The latest order was restored."
            : "The section was not moved. Its previous position was restored."}
        </p>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </DndContext>
  );
}

export function useTaskSectionSortDisabled() {
  return useContext(SectionSortState).disabled;
}
