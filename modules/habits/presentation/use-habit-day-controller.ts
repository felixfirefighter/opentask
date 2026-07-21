"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import type { HabitDayProjection, HabitDetailDto, HabitLogValue } from "../application/contracts";
import { getHabitMonth } from "./data/habit-api-client";
import { isHabitApiError } from "./data/habit-api-request";
import { habitQueryKeys } from "./data/habit-query-keys";
import {
  useEditHabitDayMutation,
  useRecordHabitDayMutation,
  useUndoHabitDayMutation,
} from "./data/use-habit-mutations";

export function useHabitDayController(detail: HabitDetailDto, day: HabitDayProjection) {
  const queryClient = useQueryClient();
  const record = useRecordHabitDayMutation();
  const edit = useEditHabitDayMutation();
  const undo = useUndoHabitDayMutation();
  const resourceId = useRef<string | null>(null);
  const [feedback, setFeedback] = useState<Readonly<{
    kind: "conflict" | "error" | "success";
    message: string;
  }> | null>(null);
  const [lastAction, setLastAction] = useState<(() => Promise<void>) | null>(null);
  const pending = record.isPending || edit.isPending || undo.isPending;

  async function save(value: HabitLogValue, targetDay: HabitDayProjection = day) {
    const action = async () => {
      setFeedback(null);
      try {
        if (targetDay.log) {
          await edit.mutateAsync({
            habitId: detail.habit.id,
            localDate: targetDay.localDate,
            input: { expectedVersion: targetDay.log.version, value },
          });
        } else {
          resourceId.current ??= crypto.randomUUID();
          await record.mutateAsync({
            habitId: detail.habit.id,
            resourceId: resourceId.current,
            input: { localDate: targetDay.localDate, value },
          });
          resourceId.current = null;
        }
        setFeedback({ kind: "success", message: "Habit day saved." });
      } catch (error) {
        setFeedback(feedbackForError(error));
        throw error;
      }
    };
    setLastAction(() => action);
    await action();
  }

  async function undoDay() {
    if (!day.log) return;
    const action = async () => {
      setFeedback(null);
      try {
        await undo.mutateAsync({
          habitId: detail.habit.id,
          localDate: day.localDate,
          input: { expectedVersion: day.log!.version },
        });
        setFeedback({ kind: "success", message: "Habit check-in removed." });
      } catch (error) {
        setFeedback(feedbackForError(error));
        throw error;
      }
    };
    setLastAction(() => action);
    await action();
  }

  async function reviewLatest(): Promise<HabitDayProjection> {
    try {
      const yearMonth = day.localDate.slice(0, 7);
      const month = await getHabitMonth(detail.habit.id, { yearMonth });
      const latest = month.days.find((candidate) => candidate.localDate === day.localDate);
      if (!latest) throw new Error("The requested local day is unavailable.");
      queryClient.setQueryData(habitQueryKeys.month(detail.habit.id, yearMonth), month);
      await queryClient.invalidateQueries({ queryKey: habitQueryKeys.all });
      setLastAction(null);
      setFeedback({ kind: "success", message: "Latest check-in loaded. Review your draft before saving." });
      return latest;
    } catch (error) {
      setFeedback({
        kind: "conflict",
        message: "The latest check-in could not be loaded. Nothing was changed.",
      });
      throw error;
    }
  }

  return {
    feedback,
    pending,
    reviewLatest,
    retry: lastAction ? () => void lastAction().catch(() => undefined) : undefined,
    save: (value: HabitLogValue, targetDay?: HabitDayProjection) => save(value, targetDay),
    undo: () => undoDay(),
  } as const;
}

function feedbackForError(error: unknown) {
  if (isHabitApiError(error) && error.code === "CONFLICT") {
    return {
      kind: "conflict" as const,
      message: "This local-day check-in changed elsewhere. Review the latest value before retrying.",
    };
  }
  if (isHabitApiError(error) && error.code === "VALIDATION_FAILED") {
    return { kind: "error" as const, message: error.message };
  }
  return {
    kind: "error" as const,
    message: "The check-in was not saved. Your entered quantity and note are still available.",
  };
}
