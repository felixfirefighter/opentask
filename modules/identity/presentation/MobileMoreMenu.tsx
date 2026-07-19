"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { CalendarRange, CheckCircle2, Grid2x2, MoreHorizontal, Settings } from "lucide-react";
import Link from "next/link";

import styles from "./AuthenticatedShell.module.css";

const items = [
  { href: "/upcoming", label: "Upcoming", icon: CalendarRange },
  { href: "/matrix", label: "Priority matrix", icon: Grid2x2 },
  { href: "/completed", label: "Completed / cancelled", icon: CheckCircle2 },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function MobileMoreMenu({ current }: Readonly<{ current: boolean }>) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.mobileMoreTrigger} aria-current={current ? "page" : undefined}>
        <MoreHorizontal size={20} aria-hidden="true" />
        <span>More</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.mobileMoreMenu} side="top" sideOffset={8} align="end">
          {items.map((item) => (
            <DropdownMenu.Item asChild key={item.href}>
              <Link className={styles.mobileMoreItem} href={item.href}>
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
