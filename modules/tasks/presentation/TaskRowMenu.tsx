"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";

import type { TaskPriority } from "../application/contracts";
import type { TaskRowProps } from "./TaskRow";
import styles from "./TaskRow.module.css";

export function TaskRowMenu({
  activeRecurrence,
  disabled,
  onMove,
  onMoveEarlier,
  onMoveLater,
  onPriorityChange,
  onDelete,
  onStatusChange,
  restore,
  task,
}: Pick<
  TaskRowProps,
  | "disabled"
  | "onDelete"
  | "onMove"
  | "onMoveEarlier"
  | "onMoveLater"
  | "onPriorityChange"
  | "onStatusChange"
  | "task"
> & {
  restore: boolean;
  activeRecurrence: boolean;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={styles.more}
          data-ui-part="more"
          aria-label={`More actions for ${task.title}`}
          title={`More actions for ${task.title}`}
        >
          <MoreHorizontal size={18} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.menu} sideOffset={6} align="end">
          {!activeRecurrence && (
            <DropdownMenu.Item
              className={styles.menuItem}
              disabled={Boolean(disabled)}
              onSelect={() => onStatusChange(restore ? "open" : "completed")}
            >
              {restore ? "Restore task" : "Complete task"}
            </DropdownMenu.Item>
          )}
          {!restore && (
            <DropdownMenu.Item
              className={styles.menuItem}
              disabled={Boolean(disabled)}
              onSelect={() => onStatusChange("cancelled")}
            >
              Cancel task
            </DropdownMenu.Item>
          )}
          {(onMoveEarlier || onMoveLater || onMove) && (
            <DropdownMenu.Separator className={styles.separator} />
          )}
          {onMoveEarlier && (
            <DropdownMenu.Item
              className={styles.menuItem}
              disabled={Boolean(disabled)}
              onSelect={onMoveEarlier}
            >
              Move earlier
            </DropdownMenu.Item>
          )}
          {onMoveLater && (
            <DropdownMenu.Item
              className={styles.menuItem}
              disabled={Boolean(disabled)}
              onSelect={onMoveLater}
            >
              Move later
            </DropdownMenu.Item>
          )}
          {onMove && (
            <DropdownMenu.Item className={styles.menuItem} disabled={Boolean(disabled)} onSelect={onMove}>
              Move to…
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className={styles.separator} />
          <DropdownMenu.Label className={styles.menuLabel}>Priority</DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={task.priority}
            onValueChange={(value) => onPriorityChange(value as TaskPriority)}
          >
            {(["high", "medium", "low", "none"] as const).map((priority) => (
              <DropdownMenu.RadioItem
                className={styles.menuItem}
                disabled={Boolean(disabled)}
                key={priority}
                value={priority}
              >
                <DropdownMenu.ItemIndicator className={styles.radioIndicator}>✓</DropdownMenu.ItemIndicator>
                {priority === "none" ? "No priority" : `${capitalize(priority)} priority`}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className={styles.separator} />
          <DropdownMenu.Item
            className={`${styles.menuItem} ${styles.dangerItem}`}
            disabled={Boolean(disabled)}
            onSelect={onDelete}
          >
            Delete task…
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}
