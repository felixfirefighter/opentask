"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ComponentPropsWithRef } from "react";

import { TaskRow } from "./TaskRow";

type SortableTaskRowProps = React.ComponentProps<typeof TaskRow> & Readonly<{ sortable: boolean }>;

export function SortableTaskRow({ sortable, task, ...props }: SortableTaskRowProps) {
  /* eslint-disable react-hooks/refs -- dnd-kit exposes callback refs and listeners for render-time wiring. */
  const sortableState = useSortable({ id: task.id, disabled: !sortable || Boolean(props.disabled) });
  const style = {
    transform: CSS.Transform.toString(sortableState.transform),
    transition: sortableState.transition,
    opacity: sortableState.isDragging ? 0.58 : undefined,
  };
  return (
    <div ref={sortableState.setNodeRef} style={style}>
      <TaskRow
        {...props}
        task={task}
        dragHandleProps={
          sortable
            ? ({
                ref: sortableState.setActivatorNodeRef,
                ...sortableState.attributes,
                ...sortableState.listeners,
              } as ComponentPropsWithRef<"button">)
            : undefined
        }
      />
    </div>
  );
  /* eslint-enable react-hooks/refs */
}
