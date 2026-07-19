"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import type { SectionDto } from "../application/contracts";
import { sectionSortId } from "./section-sort-policy";
import styles from "./TaskSectionControls.module.css";
import { useTaskSectionSortDisabled } from "./TaskSectionSortContext";

export function SortableTaskSection({
  children,
  className,
  labelledBy,
  section,
}: Readonly<{
  children: (dragHandle: ReactNode) => ReactNode;
  className: string | undefined;
  labelledBy: string;
  section: SectionDto;
}>) {
  /* eslint-disable react-hooks/refs -- dnd-kit exposes callback refs and listeners for render-time wiring. */
  const disabled = useTaskSectionSortDisabled();
  const sortable = useSortable({ id: sectionSortId(section.id), disabled });
  const style: CSSProperties = {
    opacity: sortable.isDragging ? 0.58 : undefined,
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };
  const label = `Reorder section ${section.name}`;
  return (
    <section
      ref={sortable.setNodeRef}
      aria-labelledby={labelledBy}
      className={[className, styles.sortableSection].filter(Boolean).join(" ")}
      data-dragging={sortable.isDragging || undefined}
      style={style}
    >
      {children(
        <button
          ref={sortable.setActivatorNodeRef}
          aria-label={label}
          className={styles.sectionDragHandle}
          disabled={disabled}
          title={disabled ? "Reconnect or wait to reorder sections" : label}
          type="button"
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <GripVertical size={17} aria-hidden="true" />
        </button>,
      )}
    </section>
  );
  /* eslint-enable react-hooks/refs */
}
