"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useRef, useState } from "react";

import type { FocusCorrectionView, FocusHistoryItemView, FocusLinkSearchView } from "./focus-screen-model";
import { formatFocusDuration } from "./focus-time-format";
import { FocusCorrectionDialog } from "./FocusCorrectionDialog";
import { FocusDeleteDialog } from "./FocusDeleteDialog";
import styles from "./FocusHistory.module.css";

export function FocusHistoryRow({
  disabled,
  item,
  linkSearch,
  onCorrect,
  onDelete,
  onLinkSearch,
  pendingCorrection,
  pendingDelete,
}: Readonly<{
  disabled: boolean;
  item: FocusHistoryItemView;
  linkSearch: FocusLinkSearchView;
  onCorrect: (correction: FocusCorrectionView) => Promise<boolean>;
  onDelete: () => void;
  onLinkSearch: (query: string) => void;
  pendingCorrection: boolean;
  pendingDelete: boolean;
}>) {
  const moreRef = useRef<HTMLButtonElement>(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const linkLabel = item.link
    ? !item.link.available || !item.link.label
      ? "Linked item unavailable"
      : `${capitalize(item.link.kind)} · ${item.link.label}`
    : "No linked item";
  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <strong>{formatFocusDuration(item.durationSeconds)}</strong>
        <span>
          {item.completedAtLabel} · {item.mode === "pomodoro" ? "Pomodoro" : "Stopwatch"}
        </span>
        <small>{linkLabel}</small>
      </div>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            ref={moreRef}
            className="icon-button"
            type="button"
            aria-label={`More actions for focus session completed ${item.completedAtLabel}`}
            title={`More actions for focus session completed ${item.completedAtLabel}`}
          >
            <MoreHorizontal size={18} aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={styles.menu} align="end" sideOffset={6}>
            <DropdownMenu.Item
              className={styles.menuItem}
              disabled={disabled}
              onSelect={() => setCorrectionOpen(true)}
            >
              Correct duration…
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={`${styles.menuItem} ${styles.dangerItem}`}
              disabled={disabled}
              onSelect={() => setDeleteOpen(true)}
            >
              Delete session…
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <FocusCorrectionDialog
        completedAtLabel={item.completedAtLabel}
        initialDurationSeconds={item.durationSeconds}
        initialLink={item.link}
        linkSearch={linkSearch}
        onConfirm={onCorrect}
        onLinkSearch={onLinkSearch}
        onOpenChange={setCorrectionOpen}
        open={correctionOpen}
        pending={pendingCorrection}
        returnFocusRef={moreRef}
      />
      <FocusDeleteDialog
        completedAtLabel={item.completedAtLabel}
        onConfirm={onDelete}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        pending={pendingDelete}
        returnFocusRef={moreRef}
      />
    </li>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}
