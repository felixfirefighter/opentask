"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";

import styles from "./TaskStepsEditor.module.css";

export function TaskStepMenu({
  canMoveEarlier,
  canMoveLater,
  disabled,
  label,
  onMoveEarlier,
  onMoveLater,
  onRemove,
}: Readonly<{
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  disabled: boolean;
  label: string;
  onMoveEarlier: () => void;
  onMoveLater: () => void;
  onRemove?: (() => void) | undefined;
}>) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={styles.stepMenuTrigger}
          type="button"
          disabled={disabled}
          aria-label={`Open actions for ${label}`}
          title={disabled ? "Reconnect or wait to change order" : `Actions for ${label}`}
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.stepMenu} align="end" sideOffset={4}>
          <DropdownMenu.Item
            className={styles.stepMenuItem}
            disabled={disabled || !canMoveEarlier}
            onSelect={onMoveEarlier}
          >
            Move {label} earlier
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={styles.stepMenuItem}
            disabled={disabled || !canMoveLater}
            onSelect={onMoveLater}
          >
            Move {label} later
          </DropdownMenu.Item>
          {onRemove ? (
            <>
              <DropdownMenu.Separator className={styles.stepMenuSeparator} />
              <DropdownMenu.Item className={styles.stepMenuDanger} disabled={disabled} onSelect={onRemove}>
                Remove {label}
              </DropdownMenu.Item>
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
