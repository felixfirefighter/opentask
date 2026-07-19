"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { TodayProjection } from "../application/public";
import {
  createPlanningTask,
  parsePlanningQuickAdd,
  setPlanningTaskSchedule,
  type PlanningQuickAddSuggestion,
} from "./planning-client-api";
import { nextLocalDate } from "./schedule-form-policy";
import { ScheduleEditorDialog } from "./ScheduleEditorDialog";
import { TodayScreen } from "./TodayScreen";
import { usePlanningTaskController } from "./use-planning-task-controller";
import { toTodayPlanningModel } from "./planning-view-model";

export function TodayRouteScreen({
  hourCycle,
  inboxId,
  projection,
}: Readonly<{ hourCycle: "12" | "24"; inboxId: string; projection: TodayProjection }>) {
  const router = useRouter();
  const [quickAdd, setQuickAdd] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [suggestions, setSuggestions] = useState<readonly PlanningQuickAddSuggestion[]>([]);
  const [removedTokens, setRemovedTokens] = useState<ReadonlySet<number>>(new Set());
  const [quickAddError, setQuickAddError] = useState("");
  const draft = useRef<Readonly<{ text: string; id: string }> | null>(null);
  const tasks = useMemo(
    () => [...projection.overdue, ...projection.timed, ...projection.anytime],
    [projection],
  );
  const controller = usePlanningTaskController(tasks, projection.timeZone);
  const model = toTodayPlanningModel(projection, { hourCycle });

  useEffect(() => {
    if (!quickAdd.trim()) return;
    const timeout = window.setTimeout(() => {
      void parsePlanningQuickAdd(quickAdd, projection.timeZone)
        .then((result) => setSuggestions(result.sourceText === quickAdd ? result.suggestions : []))
        .catch(() => setSuggestions([]));
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [projection.timeZone, quickAdd]);

  async function submitQuickAdd(value: string) {
    const title = value.trim();
    if (!title || submitting) return;
    if (!draft.current || draft.current.text !== title)
      draft.current = { text: title, id: crypto.randomUUID() };
    const resourceId = draft.current.id;
    const selectedSuggestion = suggestions.find((_, index) => !removedTokens.has(index));
    const schedule = selectedSuggestion?.schedule ?? {
      kind: "all_day" as const,
      startDate: projection.localDate,
      endDate: nextLocalDate(projection.localDate),
    };
    setSubmitting(true);
    setQuickAddError("");
    try {
      const created = await createPlanningTask(resourceId, { title, listId: inboxId });
      await setPlanningTaskSchedule(created.id, created.version, schedule);
      draft.current = null;
      setQuickAdd("");
      setSuggestions([]);
      setRemovedTokens(new Set());
      router.refresh();
    } catch {
      setQuickAddError(
        "The task could not be fully added to Today. Your text is still here; check Inbox before retrying.",
      );
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const condition =
    quickAddError && controller.condition.kind === "ready"
      ? ({ kind: "error", message: quickAddError } as const)
      : controller.condition;

  return (
    <>
      <TodayScreen
        model={model}
        condition={condition}
        quickAdd={{
          value: quickAdd,
          submitting,
          destinationLabel: "Today · Anytime unless a date is recognized",
          tokens: suggestions.flatMap((suggestion, index) =>
            removedTokens.has(index) ? [] : [{ id: String(index), label: suggestion.recognizedText }],
          ),
        }}
        taskActions={controller.taskActions}
        calendarHref="/calendar"
        upcomingHref="/upcoming"
        onQuickAddChange={(value) => {
          setQuickAdd(value);
          if (!value.trim()) setSuggestions([]);
          setQuickAddError("");
          setRemovedTokens(new Set());
          if (draft.current?.text !== value.trim()) draft.current = null;
        }}
        onQuickAddSubmit={(value) => void submitQuickAdd(value)}
        onRemoveQuickAddToken={(tokenId) =>
          setRemovedTokens((current) => new Set(current).add(Number(tokenId)))
        }
        onRetry={controller.retry}
      />
      <ScheduleEditorDialog
        localDate={projection.localDate}
        task={controller.scheduleTask}
        timeZone={projection.timeZone}
        onClose={controller.closeSchedule}
        onSave={controller.saveSchedule}
      />
    </>
  );
}
