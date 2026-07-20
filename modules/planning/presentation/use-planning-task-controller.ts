"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { markWorkspaceRoutesStale, useOnlineStatus } from "@/shared/presentation";

import {
  PlanningClientError,
  setPlanningTaskSchedule,
  transitionPlanningOccurrence,
  transitionPlanningTask,
  updatePlanningTaskPriority,
  type PlanningSchedule,
} from "./planning-client-api";
import type {
  CalendarChangeResult,
  CalendarEventChange,
  PlanningScreenCondition,
  PlanningTaskActions,
} from "./planning-screen-model";
import { planningTaskDetailsHref } from "./planning-task-navigation";

export type MutablePlanningTask = Readonly<{
  id: string;
  title: string;
  version: number;
  schedule: PlanningSchedule | null;
}>;

type PlanningMutationKind = "occurrence" | "priority" | "schedule" | "status";

type PlanningTaskControllerOptions = Readonly<{
  authoritativeSource?: object | undefined;
  destinationLabelForTask?: ((taskId: string) => string | null) | undefined;
  mutationsDisabled?: boolean | undefined;
  taskReturnTo?: string | null | undefined;
}>;

type MutationRecovery = Readonly<{
  kind: PlanningMutationKind;
  minimumVersion: number;
  outcome: "conflict" | "failed" | "saved" | "unconfirmed";
  restoreFocus: boolean;
  sourceProjection: object | undefined;
  sourceHeadingId: string | null;
  projectionId: string | null;
  taskId: string;
  title: string;
}>;

export function usePlanningTaskController(
  tasks: readonly MutablePlanningTask[],
  timeZone: string,
  options: PlanningTaskControllerOptions = {},
) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const inFlight = useRef(new Set<string>());
  const [failure, setFailure] = useState<Readonly<{
    conflict: boolean;
    message: string;
    taskId: string;
  }> | null>(null);
  const [scheduleTaskId, setScheduleTaskId] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<MutationRecovery | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const byId = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  const condition: PlanningScreenCondition = !online
    ? { kind: "offline" }
    : failure?.conflict
      ? { kind: "conflict", message: failure.message }
      : failure
        ? { kind: "error", message: failure.message }
        : { kind: "ready" };

  useEffect(() => {
    if (!recovery) return;
    const latest = byId.get(recovery.taskId);
    if (recovery.outcome === "unconfirmed") {
      if (options.authoritativeSource === recovery.sourceProjection) return;
    } else if (latest && latest.version < recovery.minimumVersion) {
      return;
    }

    const destination = options.destinationLabelForTask?.(recovery.taskId) ?? null;
    const timeout = window.setTimeout(() => {
      setAnnouncement(recoveryAnnouncement(recovery, destination));
      if (recovery.outcome === "unconfirmed") {
        setFailure((current) => (current?.taskId === recovery.taskId ? null : current));
      }
      if (recovery.restoreFocus) {
        restorePlanningFocus(recovery.taskId, recovery.sourceHeadingId, recovery.projectionId);
      }
      setRecovery(null);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [byId, options, recovery]);

  async function refreshAuthoritativeData() {
    await queryClient.invalidateQueries().catch(() => undefined);
    markWorkspaceRoutesStale();
    router.refresh();
  }

  async function run(
    taskId: string,
    kind: PlanningMutationKind,
    operation: (task: MutablePlanningTask) => Promise<unknown>,
    restoreFocus = true,
    projectionId: string | null = null,
  ) {
    const task = byId.get(taskId);
    if (!task || !online || options.mutationsDisabled || inFlight.current.has(taskId)) {
      if (options.mutationsDisabled) {
        setAnnouncement("Refresh this incomplete planning view before changing tasks.");
      }
      return { saved: false, conflict: false, unconfirmed: false } as const;
    }
    const sourceHeadingId = restoreFocus ? sourceHeadingForTask(taskId, projectionId) : null;
    inFlight.current.add(taskId);
    setFailure(null);
    setAnnouncement("");
    try {
      const result = await operation(task);
      setRecovery({
        kind,
        minimumVersion: resultVersion(result) ?? task.version + 1,
        outcome: "saved",
        restoreFocus,
        sourceProjection: options.authoritativeSource,
        sourceHeadingId,
        projectionId,
        taskId,
        title: task.title,
      });
      setAnnouncement(`${task.title} was saved. Refreshing the planning view.`);
      await refreshAuthoritativeData();
      return { saved: true, conflict: false, unconfirmed: false } as const;
    } catch (error) {
      const conflict = error instanceof PlanningClientError && error.code === "CONFLICT";
      const unconfirmed = !(error instanceof PlanningClientError) || error.code === "INTERNAL";
      if (unconfirmed) {
        setAnnouncement(`${task.title}'s change could not be confirmed. Loading the latest planning view.`);
      }
      setFailure({
        conflict,
        message: conflict
          ? "This task changed elsewhere. The latest server value is being restored."
          : unconfirmed
            ? "The task-change outcome could not be confirmed. The latest server value is being loaded."
            : "That task change was not saved. Your current planning view remains unchanged.",
        taskId,
      });
      setRecovery({
        kind,
        minimumVersion:
          error instanceof PlanningClientError && error.currentVersion ? error.currentVersion : task.version,
        outcome: conflict ? "conflict" : unconfirmed ? "unconfirmed" : "failed",
        restoreFocus,
        sourceProjection: options.authoritativeSource,
        sourceHeadingId,
        projectionId,
        taskId,
        title: task.title,
      });
      await refreshAuthoritativeData();
      return { saved: false, conflict, unconfirmed } as const;
    } finally {
      inFlight.current.delete(taskId);
    }
  }

  const taskActions: PlanningTaskActions = {
    onOpenTask: (taskId) => router.push(planningTaskDetailsHref(taskId, options.taskReturnTo)),
    onStatusChange: (taskId, status) => {
      void run(taskId, "status", (task) => transitionPlanningTask(taskId, task.version, status));
    },
    onOccurrenceTransition: (taskId, occurrenceKey, action, projectionId) => {
      void run(
        taskId,
        "occurrence",
        (task) => transitionPlanningOccurrence(taskId, task.version, occurrenceKey, action),
        true,
        projectionId ?? null,
      );
    },
    onPriorityChange: (taskId, priority) => {
      void run(taskId, "priority", (task) => updatePlanningTaskPriority(taskId, task.version, priority));
    },
    onEditSchedule: (taskId) => {
      if (!options.mutationsDisabled) setScheduleTaskId(taskId);
    },
    onEditSeriesSchedule: (taskId) => router.push(planningTaskDetailsHref(taskId, options.taskReturnTo)),
  };

  async function saveSchedule(taskId: string, schedule: PlanningSchedule, restoreFocus = true) {
    const result = await run(
      taskId,
      "schedule",
      (task) => setPlanningTaskSchedule(taskId, task.version, schedule),
      restoreFocus,
    );
    if (result.saved) setScheduleTaskId(null);
    return result.saved ? "saved" : result.unconfirmed ? "unconfirmed" : "failed";
  }

  async function saveCalendarChange(change: CalendarEventChange): Promise<CalendarChangeResult> {
    const schedule: PlanningSchedule = change.allDay
      ? { kind: "all_day", startDate: change.start, endDate: change.end }
      : { kind: "timed", startAt: change.start, endAt: change.end, timezone: timeZone };
    const result = await run(
      change.taskId,
      "schedule",
      (task) => setPlanningTaskSchedule(change.taskId, task.version, schedule),
      false,
    );
    return result.saved
      ? { ok: true, announcement: "Task schedule saved." }
      : {
          ok: false,
          message: result.unconfirmed
            ? "The schedule-change outcome could not be confirmed. The latest server value is being loaded."
            : "The schedule was not saved.",
          conflict: result.conflict,
        };
  }

  return {
    announcement,
    condition,
    conflictedTaskId: failure?.conflict ? failure.taskId : null,
    taskActions,
    scheduleTask: !options.mutationsDisabled && scheduleTaskId ? (byId.get(scheduleTaskId) ?? null) : null,
    closeSchedule: () => setScheduleTaskId(null),
    editSchedule: setScheduleTaskId,
    saveSchedule,
    saveCalendarChange,
    retry: () => {
      setFailure(null);
      void refreshAuthoritativeData();
    },
  } as const;
}

function resultVersion(result: unknown) {
  if (!result || typeof result !== "object") return null;
  if ("version" in result && typeof result.version === "number") return result.version;
  if (
    "task" in result &&
    result.task &&
    typeof result.task === "object" &&
    "version" in result.task &&
    typeof result.task.version === "number"
  ) {
    return result.task.version;
  }
  return null;
}

function sourceHeadingForTask(taskId: string, projectionId: string | null) {
  const row = planningTaskRow(taskId, projectionId);
  return row?.closest("section[aria-labelledby]")?.getAttribute("aria-labelledby") ?? null;
}

function restorePlanningFocus(taskId: string, sourceHeadingId: string | null, projectionId: string | null) {
  if (document.querySelector('[role="dialog"]')) return;
  const row = planningTaskRow(taskId, projectionId);
  const rowTarget = row?.querySelector<HTMLElement>("[data-planning-task-open]");
  const sourceHeading = sourceHeadingId ? document.getElementById(sourceHeadingId) : null;
  const fallback =
    document.querySelector<HTMLElement>("[data-planning-recovery-focus]") ??
    document.querySelector<HTMLElement>('h2[tabindex="-1"]') ??
    document.querySelector<HTMLElement>("[data-route-focus]");
  (rowTarget ?? sourceHeading ?? fallback)?.focus();
}

function planningTaskRow(taskId: string, projectionId: string | null = null) {
  if (projectionId) {
    const projectionRow = Array.from(
      document.querySelectorAll<HTMLElement>("[data-planning-projection-id]"),
    ).find((row) => row.dataset.planningProjectionId === projectionId);
    if (projectionRow) return projectionRow;
  }
  return Array.from(document.querySelectorAll<HTMLElement>("[data-planning-task-id]")).find(
    (row) => row.dataset.planningTaskId === taskId,
  );
}

function mutationResultLabel(kind: PlanningMutationKind) {
  if (kind === "occurrence") return "occurrence was updated";
  if (kind === "priority") return "priority was updated";
  if (kind === "schedule") return "schedule was updated";
  return "status was updated";
}

function recoveryAnnouncement(recovery: MutationRecovery, destination: string | null) {
  if (recovery.outcome === "conflict") {
    return destination
      ? `${recovery.title} changed elsewhere and is now in ${destination}.`
      : `${recovery.title} changed elsewhere. The latest planning view was restored.`;
  }
  if (recovery.outcome === "failed") {
    return `${recovery.title} was not changed. The latest planning view was restored.`;
  }
  if (recovery.outcome === "unconfirmed") {
    return `${recovery.title}'s change could not be confirmed. The latest planning view was loaded.`;
  }
  return destination && recovery.kind !== "status" && recovery.kind !== "occurrence"
    ? `${recovery.title} moved to ${destination}.`
    : `${recovery.title} ${mutationResultLabel(recovery.kind)}.`;
}
