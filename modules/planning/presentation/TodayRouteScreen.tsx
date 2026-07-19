"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { TodayProjection } from "../application/public";
import {
  createPlanningTask,
  parsePlanningQuickAdd,
  setPlanningTaskSchedule,
  type PlanningSchedule,
  type PlanningQuickAddSuggestion,
} from "./planning-client-api";
import { editedQuickAddScheduleLabel } from "./quick-add-schedule-label";
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
  const [editedTokens, setEditedTokens] = useState<ReadonlySet<number>>(new Set());
  const [editingToken, setEditingToken] = useState<number | null>(null);
  const [quickAddError, setQuickAddError] = useState("");
  const draft = useRef<Readonly<{ text: string; id: string }> | null>(null);
  const tasks = useMemo(
    () => [...projection.overdue, ...projection.timed, ...projection.anytime],
    [projection],
  );
  const controller = usePlanningTaskController(tasks, projection.timeZone);
  const model = toTodayPlanningModel(projection, { hourCycle });
  const editingSuggestion = editingToken === null ? undefined : suggestions[editingToken];
  const quickAddEditorTask = editingSuggestion
    ? {
        id: String(editingToken),
        title: quickAdd.trim() || "new task",
        version: 1,
        schedule: editingSuggestion.schedule,
      }
    : null;

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
      setEditedTokens(new Set());
      setEditingToken(null);
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

  async function saveEditedQuickAddSchedule(tokenId: string, schedule: PlanningSchedule) {
    const index = Number(tokenId);
    if (!Number.isInteger(index) || !suggestions[index] || removedTokens.has(index)) return false;
    setSuggestions((current) =>
      current.map((suggestion, suggestionIndex) =>
        suggestionIndex === index ? { ...suggestion, schedule } : suggestion,
      ),
    );
    setEditedTokens((current) => new Set(current).add(index));
    setEditingToken(null);
    return true;
  }

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
            removedTokens.has(index)
              ? []
              : [
                  {
                    id: String(index),
                    label: editedTokens.has(index)
                      ? editedQuickAddScheduleLabel(suggestion.recognizedText, suggestion.schedule, hourCycle)
                      : suggestion.recognizedText,
                  },
                ],
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
          setEditedTokens(new Set());
          setEditingToken(null);
          if (draft.current?.text !== value.trim()) draft.current = null;
        }}
        onQuickAddSubmit={(value) => void submitQuickAdd(value)}
        onEditQuickAddToken={(tokenId) => {
          const index = Number(tokenId);
          if (Number.isInteger(index) && suggestions[index] && !removedTokens.has(index)) {
            setEditingToken(index);
          }
        }}
        onRemoveQuickAddToken={(tokenId) =>
          setRemovedTokens((current) => new Set(current).add(Number(tokenId)))
        }
        onRetry={controller.retry}
      />
      <ScheduleEditorDialog
        localDate={projection.localDate}
        task={quickAddEditorTask}
        timeZone={projection.timeZone}
        onClose={() => setEditingToken(null)}
        onSave={saveEditedQuickAddSchedule}
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
