"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { CalendarRange, CheckCircle2, Grid2x2, MoreHorizontal, Settings, Sprout } from "lucide-react";
import Link from "next/link";

import styles from "./AuthenticatedShell.module.css";

const items = [
  { href: "/matrix", label: "Priority matrix", icon: Grid2x2, destination: null },
  { href: "/upcoming", label: "Upcoming", icon: CalendarRange, destination: null },
  { href: "/completed", label: "Completed / cancelled", icon: CheckCircle2, destination: null },
  { href: "/habits", label: "Habits", icon: Sprout, destination: "habits" },
  { href: "/settings", label: "Settings", icon: Settings, destination: "settings" },
] as const;

export function MobileMoreMenu({ current }: Readonly<{ current: "habits" | "settings" | null }>) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={styles.mobileMoreTrigger}
        aria-current={current !== null ? "page" : undefined}
      >
        <MoreHorizontal size={20} aria-hidden="true" />
        <span>More</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.mobileMoreMenu} side="top" sideOffset={8} align="end">
          {items.map((item) => (
            <DropdownMenu.Item asChild key={item.href}>
              <Link
                className={styles.mobileMoreItem}
                href={item.href}
                aria-current={item.destination !== null && current === item.destination ? "page" : undefined}
              >
                <item.icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
