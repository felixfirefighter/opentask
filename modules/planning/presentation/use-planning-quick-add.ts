"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { markWorkspaceRoutesStale, useOnlineStatus, useUnsavedNavigationGuard } from "@/shared/presentation";

import {
  createPlanningTaskWithSchedule,
  parsePlanningQuickAdd,
  PlanningClientError,
  type PlanningQuickAddSuggestion,
  type PlanningSchedule,
} from "./planning-client-api";
import { editedQuickAddScheduleLabel } from "./quick-add-schedule-label";

type PlanningQuickAddOptions = Readonly<{
  defaultSchedule: PlanningSchedule;
  destinationLabel: string;
  hourCycle: "12" | "24";
  inboxId: string;
  placeholder: string;
  timeZone: string;
}>;

type PlanningCreateDraft = Readonly<{
  command: Readonly<{
    listId: string;
    schedule: PlanningSchedule;
    title: string;
  }>;
  fingerprint: string;
  id: string;
}>;

export function usePlanningQuickAdd(options: PlanningQuickAddOptions) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [value, setValue] = useState("");
  const [suggestion, setSuggestion] = useState<PlanningQuickAddSuggestion | null>(null);
  const [suggestionEdited, setSuggestionEdited] = useState(false);
  const [suggestionRemoved, setSuggestionRemoved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [parsedKey, setParsedKey] = useState<string | null>(null);
  const parseRevision = useRef(0);
  const draft = useRef<PlanningCreateDraft | null>(null);
  const requestInFlight = useRef(false);
  const parsedSource = useRef<string | null>(null);
  const parseKey = `${options.timeZone}\u0000${JSON.stringify(options.defaultSchedule)}\u0000${value}`;

  useUnsavedNavigationGuard(
    uncertain,
    "Discard this unconfirmed task create? It may already exist, and leaving will discard its safe retry key.",
    discardUnconfirmedCreate,
  );

  function discardUnconfirmedCreate() {
    draft.current = null;
    parsedSource.current = null;
    setParsedKey(null);
    setValue("");
    setSuggestion(null);
    setSuggestionEdited(false);
    setSuggestionRemoved(false);
    setEditing(false);
    setError("");
    setUncertain(false);
    markWorkspaceRoutesStale();
    router.refresh();
  }

  useEffect(() => {
    const revision = ++parseRevision.current;
    if (!value.trim()) {
      parsedSource.current = null;
      return;
    }
    if (!online) return;
    if (parsedSource.current === parseKey) return;
    const timeout = window.setTimeout(() => {
      void parsePlanningQuickAdd(value, options.timeZone)
        .then((result) => {
          if (
            parseRevision.current !== revision ||
            result.sourceText !== value ||
            requestInFlight.current ||
            draft.current
          )
            return;
          parsedSource.current = parseKey;
          setParsedKey(parseKey);
          setSuggestion(result.suggestions[0] ?? null);
          setSuggestionRemoved(false);
          setSuggestionEdited(false);
          setEditing(false);
          draft.current = null;
        })
        .catch(() => {
          if (parseRevision.current === revision) {
            parsedSource.current = null;
            setParsedKey(null);
            setSuggestion(null);
          }
        });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [online, options.timeZone, parseKey, value]);

  const acceptedSuggestion =
    (parsedKey === parseKey || uncertain) && suggestion && !suggestionRemoved ? suggestion : null;
  const schedule = acceptedSuggestion?.schedule ?? options.defaultSchedule;
  const token = acceptedSuggestion
    ? {
        id: "recognized",
        label: suggestionEdited
          ? editedQuickAddScheduleLabel(acceptedSuggestion.recognizedText, schedule, options.hourCycle)
          : acceptedSuggestion.recognizedText,
        warning: quickAddWarning(acceptedSuggestion),
      }
    : null;

  async function submit(rawValue: string) {
    const title = rawValue.trim();
    if (!title || submitting || requestInFlight.current || !online) return;
    const submittedSuggestion = acceptedSuggestion;
    const submittedSuggestionEdited = suggestionEdited;
    const submittedSchedule = schedule;
    const command = { title, listId: options.inboxId, schedule: submittedSchedule };
    const fingerprint = JSON.stringify(command);
    if (!draft.current || (!uncertain && draft.current.fingerprint !== fingerprint)) {
      draft.current = { command, fingerprint, id: crypto.randomUUID() };
    }
    const submittedDraft = draft.current;
    parseRevision.current += 1;
    requestInFlight.current = true;
    setSuggestion(submittedSuggestion);
    setSuggestionRemoved(false);
    setSuggestionEdited(submittedSuggestion ? submittedSuggestionEdited : false);
    setEditing(false);
    setSubmitting(true);
    setError("");
    try {
      await createPlanningTaskWithSchedule(submittedDraft.id, submittedDraft.command);
      draft.current = null;
      setUncertain(false);
      parsedSource.current = null;
      setParsedKey(null);
      setValue("");
      setAnnouncement(`Task added to ${options.destinationLabel.split(" ·")[0] ?? "this view"}.`);
      setSuggestion(null);
      setSuggestionEdited(false);
      setSuggestionRemoved(false);
      setEditing(false);
      await queryClient.invalidateQueries();
      markWorkspaceRoutesStale();
      router.refresh();
    } catch (caught) {
      const outcomeUnconfirmed = !(caught instanceof PlanningClientError) || caught.code === "INTERNAL";
      setError(
        caught instanceof PlanningClientError && caught.code === "CONFLICT"
          ? "This create key no longer matches the task draft. Your text and schedule are still here; edit either value before retrying."
          : caught instanceof PlanningClientError && caught.code !== "INTERNAL"
            ? `${caught.message} Your text and schedule are still here.`
            : "The create outcome could not be confirmed. Retry this unchanged draft to resolve it safely; your text and schedule are still here.",
      );
      setUncertain(outcomeUnconfirmed);
      if (outcomeUnconfirmed) {
        await queryClient.invalidateQueries().catch(() => undefined);
        markWorkspaceRoutesStale();
      }
      router.refresh();
    } finally {
      requestInFlight.current = false;
      setSubmitting(false);
    }
  }

  function change(nextValue: string) {
    if (submitting || requestInFlight.current || uncertain) return;
    setValue(nextValue);
    setAnnouncement("");
    setError("");
    draft.current = null;
    parsedSource.current = null;
    setParsedKey(null);
    parseRevision.current += 1;
    setSuggestion(null);
    setSuggestionEdited(false);
    setSuggestionRemoved(false);
    setEditing(false);
  }

  return {
    editingTask:
      editing && acceptedSuggestion
        ? { id: "recognized", title: value.trim() || "new task", version: 1, schedule }
        : null,
    error,
    model: {
      announcement,
      errorMessage: error || undefined,
      placeholder: options.placeholder,
      value,
      retryLocked: uncertain,
      submitting,
      destinationLabel: options.destinationLabel,
      tokens: token ? [token] : [],
    },
    change,
    editToken(tokenId: string) {
      if (submitting || requestInFlight.current || uncertain) return;
      if (tokenId === "recognized" && acceptedSuggestion) setEditing(true);
    },
    removeToken(tokenId: string) {
      if (submitting || requestInFlight.current || uncertain) return;
      if (tokenId !== "recognized") return;
      setSuggestionRemoved(true);
      setEditing(false);
      setError("");
      draft.current = null;
    },
    saveEditedSchedule(tokenId: string, nextSchedule: PlanningSchedule) {
      if (submitting || requestInFlight.current || uncertain) return Promise.resolve("failed" as const);
      if (tokenId !== "recognized" || !acceptedSuggestion) return Promise.resolve("failed" as const);
      setSuggestion({ ...acceptedSuggestion, schedule: nextSchedule });
      setSuggestionEdited(true);
      setEditing(false);
      setError("");
      draft.current = null;
      return Promise.resolve("saved" as const);
    },
    closeEditor: () => !submitting && !requestInFlight.current && !uncertain && setEditing(false),
    submit,
  } as const;
}

function quickAddWarning(suggestion: PlanningQuickAddSuggestion): string | undefined {
  if (suggestion.warnings.includes("dst_gap_shifted_later")) {
    return "Adjusted to the next valid time because daylight-saving time skips the requested clock time.";
  }
  if (suggestion.warnings.includes("dst_fold_earlier_instance")) {
    return "Uses the earlier matching time during the daylight-saving clock change.";
  }
  return undefined;
}
