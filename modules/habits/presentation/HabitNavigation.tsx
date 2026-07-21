"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Archive, CheckCircle2, Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { HabitLifecycleView } from "./habit-screen-model";
import styles from "./HabitNavigation.module.css";

export function HabitNavigation({
  current,
  variant = "sidebar",
}: Readonly<{ current: HabitLifecycleView; variant?: "sidebar" | "compact" }>) {
  const [open, setOpen] = useState(false);
  const navigation = <HabitNavigationLinks current={current} onNavigate={() => setOpen(false)} />;
  if (variant === "sidebar") return navigation;
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className={styles.trigger} type="button" aria-label="Open habit navigation">
          <Menu size={19} aria-hidden="true" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.drawer} aria-describedby="habit-navigation-description">
          <header>
            <div>
              <Dialog.Title>Habits</Dialog.Title>
              <Dialog.Description id="habit-navigation-description">
                Choose active habits or preserved archived history.
              </Dialog.Description>
            </div>
            <Dialog.Close className={styles.close} aria-label="Close habit navigation">
              <X size={18} aria-hidden="true" />
            </Dialog.Close>
          </header>
          {navigation}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function HabitNavigationLinks({
  current,
  onNavigate,
}: Readonly<{ current: HabitLifecycleView; onNavigate: () => void }>) {
  return (
    <nav className={styles.navigation} data-context-navigation aria-label="Habit destinations">
      <Link
        href="/habits?view=active"
        aria-current={current === "active" ? "page" : undefined}
        onClick={onNavigate}
      >
        <CheckCircle2 size={17} aria-hidden="true" /> Active
      </Link>
      <Link
        href="/habits?view=archived"
        aria-current={current === "archived" ? "page" : undefined}
        onClick={onNavigate}
      >
        <Archive size={17} aria-hidden="true" /> Archived
      </Link>
    </nav>
  );
}
