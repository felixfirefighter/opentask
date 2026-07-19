"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Menu, RotateCw, X } from "lucide-react";
import type { ReactNode } from "react";

import styles from "./TaskNavigationOverlays.module.css";

export function CompactTaskNavigation({
  children,
  onOpenChange,
  open,
}: Readonly<{ children: ReactNode; onOpenChange: (open: boolean) => void; open: boolean }>) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <button className={styles.drawerTrigger} type="button" aria-label="Open task navigation">
          <Menu size={19} aria-hidden="true" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.drawerOverlay} />
        <Dialog.Content className={styles.drawer} aria-describedby="task-navigation-description">
          <header className={styles.drawerHeader}>
            <div>
              <Dialog.Title>Tasks</Dialog.Title>
              <Dialog.Description id="task-navigation-description">
                Choose or organize a task list.
              </Dialog.Description>
            </div>
            <Dialog.Close className={styles.drawerClose} aria-label="Close task navigation">
              <X size={18} aria-hidden="true" />
            </Dialog.Close>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function NavigationLoading() {
  return (
    <div className={styles.loading} aria-busy="true">
      <p role="status">Loading task navigation</p>
      {[0, 1, 2, 3].map((row) => (
        <span aria-hidden="true" key={row} />
      ))}
    </div>
  );
}

export function NavigationFailure({ onRetry }: Readonly<{ onRetry: () => void }>) {
  return (
    <div className={styles.failure} role="alert">
      <p>Task navigation could not be loaded.</p>
      <button type="button" onClick={onRetry}>
        <RotateCw size={15} aria-hidden="true" />
        Retry navigation
      </button>
    </div>
  );
}
