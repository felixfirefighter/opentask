"use client";

import { useState } from "react";

import {
  taskReminderOffsetMinutesSchema,
  type TaskRecurrenceReminderResolution,
} from "../application/contracts/task-reminder-contract";
import type { TaskRecurrenceReminderChoice } from "./TaskRecurrenceReminderDialog";
import type { TaskRecurrenceReminderReview } from "./task-recurrence-reminder-review";

type SavePreparation = "blocked" | "needs_review" | "ready";

export function useTaskRecurrenceReminderResolution(reminderReview: TaskRecurrenceReminderReview) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<TaskRecurrenceReminderChoice>(null);
  const [offsetMinutes, setOffsetMinutes] = useState("0");
  const [error, setError] = useState("");

  function prepareForSave(): SavePreparation {
    if (reminderReview.status !== "ready") {
      setError("Reload the saved reminder status before changing recurrence.");
      return "blocked";
    }
    if (reminderReview.absoluteReminderVersion !== null) {
      setError("");
      setOpen(true);
      return "needs_review";
    }
    return "ready";
  }

  function parseChoice(): TaskRecurrenceReminderResolution | null {
    const expectedReminderVersion = reminderReview.absoluteReminderVersion;
    if (expectedReminderVersion === null || choice === null) {
      setError("Choose whether to convert or remove the saved reminder.");
      return null;
    }
    if (choice === "remove") return { kind: "remove", expectedReminderVersion };
    if (!/^\d+$/u.test(offsetMinutes.trim())) return invalidOffset();
    const offset = taskReminderOffsetMinutesSchema.safeParse(Number(offsetMinutes));
    if (!offset.success) return invalidOffset();
    return {
      kind: "convert_relative_start",
      expectedReminderVersion,
      offsetMinutes: offset.data,
    };
  }

  function forRetry(
    attempted: TaskRecurrenceReminderResolution | null,
  ): TaskRecurrenceReminderResolution | null | undefined {
    if (attempted === null) return null;
    if (reminderReview.status !== "ready") return undefined;
    const expectedReminderVersion = reminderReview.absoluteReminderVersion;
    if (expectedReminderVersion === null) return null;
    return attempted.kind === "remove"
      ? { kind: "remove", expectedReminderVersion }
      : {
          kind: "convert_relative_start",
          expectedReminderVersion,
          offsetMinutes: attempted.offsetMinutes,
        };
  }

  function changeOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) setError("");
  }

  function changeChoice(nextChoice: Exclude<TaskRecurrenceReminderChoice, null>) {
    setChoice(nextChoice);
    setError("");
  }

  function changeOffsetMinutes(value: string) {
    setOffsetMinutes(value);
    setError("");
  }

  function resetDraft() {
    setChoice(null);
    setOffsetMinutes("0");
    setError("");
  }

  function invalidOffset(): null {
    setError("Minutes before start must be a whole number from 0 to 10,080.");
    return null;
  }

  return {
    changeChoice,
    changeOffsetMinutes,
    changeOpen,
    choice,
    close: () => setOpen(false),
    error,
    forRetry,
    offsetMinutes,
    open,
    parseChoice,
    prepareForSave,
    resetDraft,
  } as const;
}
