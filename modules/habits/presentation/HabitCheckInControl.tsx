"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, MoreHorizontal, RotateCcw } from "lucide-react";
import { useState } from "react";

import type { HabitDayProjection, HabitDetailDto, HabitLogValue } from "../application/contracts";
import { HabitDayEditorDialog } from "./HabitDayEditorDialog";
import { useHabitDayController } from "./use-habit-day-controller";
import styles from "./HabitCheckInControl.module.css";

export function HabitCheckInControl({
  day,
  detail,
  disabled = false,
  disabledReason = "Reconnect to change this habit.",
  requiresAction = true,
}: Readonly<{
  day: HabitDayProjection;
  detail: HabitDetailDto;
  disabled?: boolean;
  disabledReason?: string;
  requiresAction?: boolean;
}>) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorDay, setEditorDay] = useState(day);
  const controller = useHabitDayController(detail, day);
  const { habit } = detail;
  const hasLog = day.log !== null;
  const completedBoolean = habit.goal.goalKind === "boolean" && day.log?.state === "completed";
  const mutationDisabled = disabled || controller.pending;
  const showMoreActions = hasLog || (day.scheduled && requiresAction);

  function save(value: HabitLogValue, targetDay: HabitDayProjection = day) {
    if (mutationDisabled) return;
    void controller
      .save(value, targetDay)
      .then(() => setEditorOpen(false))
      .catch(() => undefined);
  }

  function openEditor() {
    if (mutationDisabled || (!day.scheduled && !day.log)) return;
    setEditorDay(day);
    setEditorOpen(true);
  }

  function openEditorFromMenu() {
    if (mutationDisabled || (!day.scheduled && !day.log)) return;
    setEditorDay(day);
    window.setTimeout(() => setEditorOpen(true), 0);
  }

  async function reviewEditorLatest(): Promise<HabitLogValue | null> {
    const latest = await controller.reviewLatest();
    setEditorDay(latest);
    return latest.log ? logValue(latest.log) : null;
  }

  function undo() {
    if (mutationDisabled) return;
    void controller.undo().catch(() => undefined);
  }

  function retry() {
    if (mutationDisabled) return;
    controller.retry?.();
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.actions}>
        {!day.scheduled && !hasLog ? (
          <span className={styles.notScheduled}>Not scheduled</span>
        ) : !requiresAction && !hasLog ? (
          <span className={styles.achieved}>
            <Check size={16} aria-hidden="true" /> Achieved
          </span>
        ) : completedBoolean ? (
          <button className={styles.primary} type="button" disabled={mutationDisabled} onClick={undo}>
            <RotateCcw size={16} aria-hidden="true" /> Undo
          </button>
        ) : habit.goal.goalKind === "boolean" && !hasLog ? (
          <button
            className={styles.primary}
            type="button"
            disabled={mutationDisabled}
            onClick={() => save({ state: "completed", quantity: null, note: null })}
          >
            <Check size={16} aria-hidden="true" /> Check in
          </button>
        ) : (
          <button className={styles.primary} type="button" disabled={mutationDisabled} onClick={openEditor}>
            {hasLog ? "Edit check-in" : "Enter quantity"}
          </button>
        )}
        {showMoreActions ? (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              className={styles.more}
              disabled={mutationDisabled}
              aria-label={`More check-in actions for ${habit.title}`}
            >
              <MoreHorizontal size={18} aria-hidden="true" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className={styles.menu} align="end" sideOffset={6}>
                <DropdownMenu.Item
                  className={styles.menuItem}
                  disabled={mutationDisabled}
                  onSelect={openEditorFromMenu}
                >
                  Edit check-in…
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={styles.menuItem}
                  disabled={mutationDisabled}
                  onSelect={() => save({ state: "skipped", quantity: null, note: day.log?.note ?? null })}
                >
                  Skip this day
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={styles.menuItem}
                  disabled={mutationDisabled}
                  onSelect={() => save({ state: "unachieved", quantity: null, note: day.log?.note ?? null })}
                >
                  Mark unachieved
                </DropdownMenu.Item>
                {hasLog ? (
                  <DropdownMenu.Item className={styles.menuItem} disabled={mutationDisabled} onSelect={undo}>
                    Undo check-in
                  </DropdownMenu.Item>
                ) : null}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        ) : null}
      </div>
      {disabled && showMoreActions ? <span className={styles.disabledReason}>{disabledReason}</span> : null}
      {controller.feedback ? (
        <div
          className={styles.feedback}
          data-kind={controller.feedback.kind}
          role={controller.feedback.kind === "success" ? "status" : "alert"}
        >
          <span>{controller.feedback.message}</span>
          {controller.feedback.kind === "conflict" ? (
            <button type="button" disabled={disabled} onClick={() => void controller.reviewLatest()}>
              Review latest
            </button>
          ) : null}
          {controller.feedback.kind === "error" && controller.retry ? (
            <button type="button" disabled={disabled} onClick={retry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      <HabitDayEditorDialog
        conflictPendingReview={controller.feedback?.kind === "conflict"}
        errorMessage={controller.feedback?.kind === "success" ? null : (controller.feedback?.message ?? null)}
        goal={habit.goal}
        initialValue={editorDay.log ? logValue(editorDay.log) : null}
        localDate={editorDay.localDate}
        onOpenChange={setEditorOpen}
        onReviewLatest={reviewEditorLatest}
        onSubmit={(value) => save(value, editorDay)}
        open={editorOpen}
        pending={controller.pending}
        title={`${hasLog ? "Edit" : "Record"} ${habit.title}`}
        writeDisabled={disabled}
      />
    </div>
  );
}

function logValue(log: NonNullable<HabitDayProjection["log"]>): HabitLogValue {
  if (log.state === "completed") {
    return { state: "completed", quantity: log.quantity, note: log.note };
  }
  if (log.state === "skipped") return { state: "skipped", quantity: null, note: log.note };
  return { state: "unachieved", quantity: null, note: log.note };
}
