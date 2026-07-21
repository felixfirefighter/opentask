"use client";

import { useEffect, useRef, useState } from "react";

import { useOnlineStatus, useUnsavedNavigationGuard } from "@/shared/presentation";

import type { QuickAddParseResult, TaskScheduleValue } from "../application/contracts";
import { parseQuickAdd } from "./data/task-api-client";
import { isTaskApiError } from "./data/task-api-request";
import { useCreateTaskMutation, useCreateTaskWithScheduleMutation } from "./data/use-task-editor-mutations";
import { formatTaskSchedule } from "./task-schedule-form-policy";

type QuickAddSuggestion = QuickAddParseResult["suggestions"][number];

type TaskCreateDraft = Readonly<{
  fingerprint: string;
  id: string;
  input: Readonly<{
    title: string;
    descriptionMd: string;
    priority: "none";
    listId: string;
    sectionId: string | null;
    parentTaskId: null;
    placement: Readonly<{ kind: "start" }>;
  }>;
  schedule: TaskScheduleValue | null;
}>;

export function useTaskQuickAddController({
  hourCycle,
  listId,
  sectionId,
  timeZone,
}: Readonly<{
  hourCycle: "h12" | "h23";
  listId: string;
  sectionId: string | null;
  timeZone: string;
}>) {
  const online = useOnlineStatus();
  const create = useCreateTaskMutation();
  const createScheduled = useCreateTaskWithScheduleMutation();
  const [title, setTitle] = useState("");
  const [suggestion, setSuggestion] = useState<QuickAddSuggestion | null>(null);
  const [removed, setRemoved] = useState(false);
  const [edited, setEdited] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [parsedKey, setParsedKey] = useState<string | null>(null);
  const parseRevision = useRef(0);
  const requestInFlight = useRef(false);
  const titleRef = useRef("");
  const draft = useRef<TaskCreateDraft | null>(null);
  const parsedSource = useRef<string | null>(null);
  const parseKey = `${timeZone}\u0000${title}`;

  useUnsavedNavigationGuard(
    uncertain,
    "Discard this unconfirmed task create? It may already exist, and leaving will discard its safe retry key.",
    reset,
  );

  useEffect(() => {
    const revision = ++parseRevision.current;
    if (!title.trim()) {
      parsedSource.current = null;
      return;
    }
    if (!online) return;
    if (parsedSource.current === parseKey) return;
    const timeout = window.setTimeout(() => {
      void parseQuickAdd(title, timeZone)
        .then((result) => {
          if (
            parseRevision.current !== revision ||
            result.sourceText !== title ||
            requestInFlight.current ||
            draft.current
          )
            return;
          parsedSource.current = parseKey;
          setParsedKey(parseKey);
          setSuggestion(result.suggestions[0] ?? null);
          setRemoved(false);
          setEdited(false);
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
  }, [online, parseKey, timeZone, title]);

  const accepted = (parsedKey === parseKey || uncertain) && suggestion && !removed ? suggestion : null;
  const currentMutation = accepted ? createScheduled : create;
  const isPending = pending || create.isPending || createScheduled.isPending;
  const error = currentMutation.error;

  async function submit() {
    const cleanTitle = title.trim();
    if (!cleanTitle || !online || requestInFlight.current || isPending) return;
    const submittedSuggestion = accepted;
    const submittedEdited = edited;
    const input = {
      title: cleanTitle,
      descriptionMd: "",
      priority: "none" as const,
      listId,
      sectionId,
      parentTaskId: null,
      placement: { kind: "start" as const },
    };
    const schedule = accepted?.schedule ?? null;
    const fingerprint = JSON.stringify({ input, schedule });
    if (!draft.current || (!uncertain && draft.current.fingerprint !== fingerprint)) {
      draft.current = { fingerprint, id: crypto.randomUUID(), input, schedule };
    }
    const submittedDraft = draft.current;
    const resourceId = submittedDraft.id;
    const submittedTitle = title;
    parseRevision.current += 1;
    requestInFlight.current = true;
    setSuggestion(submittedSuggestion);
    setRemoved(false);
    setEdited(submittedSuggestion ? submittedEdited : false);
    setEditing(false);
    setPending(true);
    try {
      if (submittedDraft.schedule) {
        await createScheduled.mutateAsync({
          resourceId,
          input: { ...submittedDraft.input, schedule: submittedDraft.schedule },
        });
      } else {
        await create.mutateAsync({ resourceId, input: submittedDraft.input });
      }
      if (draft.current?.id === resourceId && titleRef.current === submittedTitle) {
        reset();
        setAnnouncement("Task added.");
      }
    } catch (caught) {
      setUncertain(!isTaskApiError(caught) || caught.code === "INTERNAL");
      // Mutation state renders the scoped error while the complete draft remains available.
    } finally {
      requestInFlight.current = false;
      setPending(false);
    }
  }

  function changeTitle(value: string) {
    if (requestInFlight.current || isPending || uncertain) return;
    titleRef.current = value;
    setAnnouncement("");
    setTitle(value);
    draft.current = null;
    parsedSource.current = null;
    setParsedKey(null);
    create.reset();
    createScheduled.reset();
    parseRevision.current += 1;
    setSuggestion(null);
    setRemoved(false);
    setEdited(false);
    setEditing(false);
  }

  function reset() {
    draft.current = null;
    parsedSource.current = null;
    setParsedKey(null);
    titleRef.current = "";
    setTitle("");
    setSuggestion(null);
    setRemoved(false);
    setEdited(false);
    setEditing(false);
    setUncertain(false);
    setAnnouncement("");
    create.reset();
    createScheduled.reset();
  }

  return {
    acceptedSchedule: accepted?.schedule ?? null,
    announcement,
    errorMessage: error
      ? isTaskApiError(error) && error.code !== "INTERNAL"
        ? error.message
        : "The create outcome could not be confirmed. Retry this unchanged draft to resolve it safely; your title and recognized schedule are still here."
      : null,
    isPending,
    retryLocked: uncertain,
    online,
    scheduleEditorOpen: editing && accepted !== null,
    suggestionLabel: accepted
      ? edited
        ? formatTaskSchedule(accepted.schedule, timeZone, hourCycle)
        : accepted.recognizedText
      : null,
    suggestionWarning: accepted ? warningFor(accepted) : null,
    title,
    changeTitle,
    clear() {
      if (!isPending && !uncertain) reset();
    },
    escape() {
      if (isPending || uncertain) return;
      if (accepted) {
        setRemoved(true);
        setEditing(false);
        draft.current = null;
        create.reset();
        createScheduled.reset();
      } else {
        reset();
      }
    },
    editSchedule: () => accepted && !uncertain && setEditing(true),
    removeSchedule() {
      if (uncertain) return;
      setRemoved(true);
      setEditing(false);
      draft.current = null;
      create.reset();
      createScheduled.reset();
    },
    saveSchedule(schedule: TaskScheduleValue) {
      if (!accepted || uncertain) return;
      setSuggestion({ ...accepted, schedule });
      setEdited(true);
      setEditing(false);
      draft.current = null;
      create.reset();
      createScheduled.reset();
    },
    closeSchedule: () => !uncertain && setEditing(false),
    submit,
  } as const;
}

function warningFor(suggestion: QuickAddSuggestion): string | null {
  if (suggestion.warnings.includes("dst_gap_shifted_later")) {
    return "Adjusted to the next valid time because daylight-saving time skips the requested clock time.";
  }
  if (suggestion.warnings.includes("dst_fold_earlier_instance")) {
    return "Uses the earlier matching time during the daylight-saving clock change.";
  }
  return null;
}
