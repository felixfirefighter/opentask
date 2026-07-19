"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import styles from "./TaskStepsEditor.module.css";

export function SortableTaskStep({
  children,
  className,
  disabled,
  id,
  label,
}: Readonly<{
  children: (handle: ReactNode) => ReactNode;
  className: string;
  disabled: boolean;
  id: string;
  label: string;
}>) {
  /* eslint-disable react-hooks/refs -- dnd-kit exposes callback refs and listeners for render-time wiring. */
  const sortable = useSortable({ id, disabled });
  const style: CSSProperties = {
    opacity: sortable.isDragging ? 0.58 : undefined,
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  return (
    <div
      ref={sortable.setNodeRef}
      className={className}
      data-dragging={sortable.isDragging || undefined}
      style={style}
    >
      {children(
        <button
          ref={sortable.setActivatorNodeRef}
          className={styles.dragHandle}
          type="button"
          disabled={disabled}
          aria-label={`Reorder ${label}`}
          title={disabled ? "Reconnect or wait to reorder" : `Reorder ${label}`}
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>,
      )}
    </div>
  );
  /* eslint-enable react-hooks/refs */
}
