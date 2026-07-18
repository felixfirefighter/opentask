"use client";

import { Settings } from "lucide-react";
import Link from "next/link";
import { type FocusEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

import type { SessionIdentity } from "@/modules/identity";

import styles from "./AccountMenu.module.css";
import { SignOutButton } from "./SignOutButton";

export function AccountMenu({
  identity,
  placement,
  settingsCurrent,
}: {
  identity: SessionIdentity;
  placement: "rail" | "header";
  settingsCurrent: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = `account-actions-${useId()}`;

  useEffect(() => {
    if (!open) return;

    menuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  function closeAndRestoreFocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleMenuKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndRestoreFocus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;

    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']:not(:disabled)") ?? [],
    );
    if (items.length === 0) return;
    event.preventDefault();

    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex = getNextMenuIndex(event.key, currentIndex, items.length);
    items[nextIndex]?.focus();
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }

  const displayName = identity.displayName.trim() || identity.email;

  return (
    <div className={styles.account} ref={rootRef} onBlur={handleBlur}>
      <button
        ref={triggerRef}
        className={styles.accountTrigger}
        data-current={settingsCurrent || undefined}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Open account actions for ${displayName}`}
        title="Account"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span aria-hidden="true">{getInitials(displayName)}</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          className={styles.accountMenu}
          data-placement={placement}
          role="menu"
          aria-label="Account actions"
          onKeyDown={handleMenuKeys}
        >
          <div className={styles.accountIdentity} role="none">
            <strong>{displayName}</strong>
            <span>{identity.email}</span>
          </div>
          <Link
            className={styles.menuItem}
            href="/settings"
            role="menuitem"
            aria-current={settingsCurrent ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            <Settings size={17} aria-hidden="true" />
            <span>Settings</span>
          </Link>
          <SignOutButton />
        </div>
      )}
    </div>
  );
}

function getInitials(value: string) {
  const parts = value.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? parts.at(-1)?.[0] : "";
  return `${first}${last ?? ""}`.toUpperCase();
}

function getNextMenuIndex(key: string, currentIndex: number, itemCount: number) {
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  if (key === "ArrowUp") return currentIndex <= 0 ? itemCount - 1 : currentIndex - 1;
  return currentIndex < 0 || currentIndex === itemCount - 1 ? 0 : currentIndex + 1;
}
