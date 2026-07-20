"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  CalendarClock,
  Check,
  MoreHorizontal,
  Repeat2,
  RotateCcw,
  SkipForward,
  Undo2,
  XCircle,
} from "lucide-react";

import type {
  PlanningPriority,
  PlanningTaskActions,
  PlanningTaskRowModel,
  PlanningTaskStatus,
} from "./planning-screen-model";
import styles from "./ProjectionTaskRow.module.css";

const priorities: readonly PlanningPriority[] = ["high", "medium", "low", "none"];

export function ProjectionTaskMenu({
  actions,
  disabled,
  disabledReason,
  task,
}: Readonly<{
  actions: PlanningTaskActions;
  disabled: boolean;
  disabledReason?: string | undefined;
  task: PlanningTaskRowModel;
}>) {
  const recurring = task.projectionLifecycle !== "one_off";
  const occurrence = task.projectionLifecycle === "recurring_occurrence" && task.occurrenceKey !== null;
  const hasMenuAction =
    actions.onPriorityChange ||
    (recurring ? actions.onEditSeriesSchedule : actions.onEditSchedule) ||
    (occurrence && actions.onOccurrenceTransition) ||
    actions.onStatusChange;
  if (!hasMenuAction) return null;

  const nextLifecycle = task.status === "open" ? "cancelled" : "open";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={styles.more}
          aria-label={`More actions for ${task.title}`}
          disabled={disabled}
          title={
            disabled ? (disabledReason ?? "Task changes are unavailable.") : `More actions for ${task.title}`
          }
        >
          <MoreHorizontal size={18} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.menu} sideOffset={4} align="end">
          {recurring
            ? actions.onEditSeriesSchedule && (
                <DropdownMenu.Item
                  className={styles.menuItem}
                  onSelect={() => actions.onEditSeriesSchedule?.(task.taskId)}
                >
                  <Repeat2 size={16} aria-hidden="true" /> Edit future series schedule
                </DropdownMenu.Item>
              )
            : actions.onEditSchedule && (
                <DropdownMenu.Item
                  className={styles.menuItem}
                  onSelect={() => actions.onEditSchedule?.(task.taskId)}
                >
                  <CalendarClock size={16} aria-hidden="true" /> Edit schedule
                </DropdownMenu.Item>
              )}
          {occurrence && actions.onOccurrenceTransition ? (
            <OccurrenceItems actions={actions} task={task} />
          ) : null}
          {actions.onPriorityChange ? (
            <>
              <DropdownMenu.Separator className={styles.separator} />
              <DropdownMenu.Label className={styles.menuLabel}>Priority</DropdownMenu.Label>
              <DropdownMenu.RadioGroup
                value={task.priority}
                onValueChange={(value) => {
                  if (isPlanningPriority(value)) actions.onPriorityChange?.(task.taskId, value);
                }}
              >
                {priorities.map((priority) => (
                  <DropdownMenu.RadioItem className={styles.menuItem} key={priority} value={priority}>
                    <DropdownMenu.ItemIndicator className={styles.radioIndicator}>
                      <Check size={14} aria-hidden="true" />
                    </DropdownMenu.ItemIndicator>
                    {priorityLabel(priority)}
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
            </>
          ) : null}
          {actions.onStatusChange ? (
            <>
              <DropdownMenu.Separator className={styles.separator} />
              <LifecycleItem
                nextStatus={nextLifecycle}
                recurring={recurring}
                onSelect={() => actions.onStatusChange?.(task.taskId, nextLifecycle)}
              />
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function OccurrenceItems({
  actions,
  task,
}: Readonly<{ actions: PlanningTaskActions; task: PlanningTaskRowModel }>) {
  const transition = actions.onOccurrenceTransition;
  const occurrenceKey = task.occurrenceKey;
  if (!transition || occurrenceKey === null) return null;
  return (
    <>
      <DropdownMenu.Separator className={styles.separator} />
      {task.occurrenceState === "open" ? (
        <>
          <DropdownMenu.Item
            className={styles.menuItem}
            onSelect={() => transition(task.taskId, occurrenceKey, "complete", task.projectionId)}
          >
            <Check size={16} aria-hidden="true" /> Complete occurrence
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={styles.menuItem}
            onSelect={() => transition(task.taskId, occurrenceKey, "skip", task.projectionId)}
          >
            <SkipForward size={16} aria-hidden="true" /> Skip occurrence
          </DropdownMenu.Item>
        </>
      ) : (
        <DropdownMenu.Item
          className={styles.menuItem}
          onSelect={() => transition(task.taskId, occurrenceKey, "undo", task.projectionId)}
        >
          <Undo2 size={16} aria-hidden="true" /> Undo occurrence
        </DropdownMenu.Item>
      )}
    </>
  );
}

function LifecycleItem({
  nextStatus,
  onSelect,
  recurring,
}: {
  nextStatus: PlanningTaskStatus;
  onSelect: () => void;
  recurring: boolean;
}) {
  const restore = nextStatus === "open";
  const label = restore
    ? recurring
      ? "Restore series task"
      : "Restore task"
    : recurring
      ? "Cancel series task"
      : "Mark as won't do";
  return (
    <DropdownMenu.Item className={styles.menuItem} onSelect={onSelect}>
      {restore ? <RotateCcw size={16} aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />}
      {label}
    </DropdownMenu.Item>
  );
}

function priorityLabel(priority: PlanningPriority) {
  return priority === "none" ? "No priority" : `${priority[0]?.toUpperCase()}${priority.slice(1)}`;
}

function isPlanningPriority(value: string): value is PlanningPriority {
  return priorities.some((priority) => priority === value);
}
