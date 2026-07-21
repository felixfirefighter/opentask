"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/shared/presentation";

import type { FocusPendingAction, FocusPresentationActions, FocusTimerView } from "./focus-screen-model";
import { FocusDiscardDialog } from "./FocusDiscardDialog";
import styles from "./FocusTimerControls.module.css";

export function FocusTimerControls({
  actions,
  disabled,
  pendingAction,
  timer,
}: Readonly<{
  actions: FocusPresentationActions;
  disabled: boolean;
  pendingAction: FocusPendingAction | null;
  timer: FocusTimerView;
}>) {
  const moreRef = useRef<HTMLButtonElement>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const pending = pendingAction !== null;

  if (timer.kind === "idle") {
    return (
      <div className={styles.controls}>
        <Button type="button" disabled={disabled || pending} onClick={actions.onStartFocus}>
          {pendingAction === "start-focus" ? "Starting…" : "Start focus"}
        </Button>
        {timer.mode === "pomodoro" ? (
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || pending}
            onClick={actions.onStartBreak}
          >
            {pendingAction === "start-break" ? "Starting break…" : "Start break"}
          </Button>
        ) : null}
      </div>
    );
  }

  const paused = timer.status === "paused";
  const finishLabel = timer.phase === "break" ? "Skip break" : "Finish focus";
  return (
    <>
      <div className={styles.controls}>
        <Button
          type="button"
          disabled={disabled || pending}
          onClick={paused ? actions.onResume : actions.onPause}
        >
          {paused
            ? pendingAction === "resume"
              ? "Resuming…"
              : "Resume"
            : pendingAction === "pause"
              ? "Pausing…"
              : "Pause"}
        </Button>
        <Button type="button" variant="secondary" disabled={disabled || pending} onClick={actions.onFinish}>
          {pendingAction === "finish" ? "Finishing…" : finishLabel}
        </Button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              ref={moreRef}
              className="icon-button"
              type="button"
              aria-label="More timer actions"
              title="More timer actions"
            >
              <MoreHorizontal size={18} aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={styles.menu} align="end" sideOffset={6}>
              <DropdownMenu.Item
                className={styles.menuItem}
                disabled={disabled || pending}
                onSelect={() => setDiscardOpen(true)}
              >
                Discard timer…
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      <FocusDiscardDialog
        onConfirm={actions.onDiscard}
        onOpenChange={setDiscardOpen}
        open={discardOpen}
        pending={pendingAction === "discard"}
        returnFocusRef={moreRef}
        subject={timer.phase === "break" ? "break timer" : "focus timer"}
      />
    </>
  );
}
