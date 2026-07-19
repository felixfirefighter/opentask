"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { CalendarClock, Check, MoreHorizontal, RotateCcw, XCircle } from "lucide-react";

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
  const hasMenuAction = actions.onPriorityChange || actions.onEditSchedule || actions.onStatusChange;
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
          {actions.onEditSchedule ? (
            <DropdownMenu.Item className={styles.menuItem} onSelect={() => actions.onEditSchedule?.(task.id)}>
              <CalendarClock size={16} aria-hidden="true" /> Edit schedule
            </DropdownMenu.Item>
          ) : null}
          {actions.onPriorityChange ? (
            <>
              <DropdownMenu.Separator className={styles.separator} />
              <DropdownMenu.Label className={styles.menuLabel}>Priority</DropdownMenu.Label>
              <DropdownMenu.RadioGroup
                value={task.priority}
                onValueChange={(value) => {
                  if (isPlanningPriority(value)) actions.onPriorityChange?.(task.id, value);
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
                onSelect={() => actions.onStatusChange?.(task.id, nextLifecycle)}
              />
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function LifecycleItem({ nextStatus, onSelect }: { nextStatus: PlanningTaskStatus; onSelect: () => void }) {
  const restore = nextStatus === "open";
  return (
    <DropdownMenu.Item className={styles.menuItem} onSelect={onSelect}>
      {restore ? <RotateCcw size={16} aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />}
      {restore ? "Restore task" : "Mark as won't do"}
    </DropdownMenu.Item>
  );
}

function priorityLabel(priority: PlanningPriority) {
  return priority === "none" ? "No priority" : `${priority[0]?.toUpperCase()}${priority.slice(1)}`;
}

function isPlanningPriority(value: string): value is PlanningPriority {
  return priorities.some((priority) => priority === value);
}
