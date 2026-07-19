"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { useOnlineStatus } from "@/shared/presentation";

import {
  PlanningClientError,
  setPlanningTaskSchedule,
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

export type MutablePlanningTask = Readonly<{
  id: string;
  title: string;
  version: number;
  schedule: PlanningSchedule | null;
}>;

export function usePlanningTaskController(tasks: readonly MutablePlanningTask[], timeZone: string) {
  const router = useRouter();
  const online = useOnlineStatus();
  const inFlight = useRef(new Set<string>());
  const [failure, setFailure] = useState<Readonly<{ conflict: boolean; message: string }> | null>(null);
  const [scheduleTaskId, setScheduleTaskId] = useState<string | null>(null);
  const byId = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  const condition: PlanningScreenCondition = !online
    ? { kind: "offline" }
    : failure?.conflict
      ? { kind: "conflict", message: failure.message }
      : failure
        ? { kind: "error", message: failure.message }
        : { kind: "ready" };

  async function run(taskId: string, operation: (task: MutablePlanningTask) => Promise<unknown>) {
    const task = byId.get(taskId);
    if (!task || !online || inFlight.current.has(taskId)) {
      return { saved: false, conflict: false } as const;
    }
    inFlight.current.add(taskId);
    setFailure(null);
    try {
      await operation(task);
      router.refresh();
      return { saved: true, conflict: false } as const;
    } catch (error) {
      const conflict = error instanceof PlanningClientError && error.code === "CONFLICT";
      setFailure({
        conflict,
        message: conflict
          ? "This task changed elsewhere. The latest server value is being restored."
          : "That task change was not saved. Your current planning view remains unchanged.",
      });
      router.refresh();
      return { saved: false, conflict } as const;
    } finally {
      inFlight.current.delete(taskId);
    }
  }

  const taskActions: PlanningTaskActions = {
    onOpenTask: (taskId) => router.push(`/tasks/${taskId}`),
    onStatusChange: (taskId, status) => {
      void run(taskId, (task) => transitionPlanningTask(taskId, task.version, status));
    },
    onPriorityChange: (taskId, priority) => {
      void run(taskId, (task) => updatePlanningTaskPriority(taskId, task.version, priority));
    },
    onEditSchedule: setScheduleTaskId,
  };

  async function saveSchedule(taskId: string, schedule: PlanningSchedule) {
    const result = await run(taskId, (task) => setPlanningTaskSchedule(taskId, task.version, schedule));
    if (result.saved) setScheduleTaskId(null);
    return result.saved;
  }

  async function saveCalendarChange(change: CalendarEventChange): Promise<CalendarChangeResult> {
    const schedule: PlanningSchedule = change.allDay
      ? { kind: "all_day", startDate: change.start, endDate: change.end }
      : { kind: "timed", startAt: change.start, endAt: change.end, timezone: timeZone };
    const result = await run(change.taskId, (task) =>
      setPlanningTaskSchedule(change.taskId, task.version, schedule),
    );
    return result.saved
      ? { ok: true, announcement: "Task schedule saved." }
      : { ok: false, message: "The schedule was not saved.", conflict: result.conflict };
  }

  return {
    condition,
    taskActions,
    scheduleTask: scheduleTaskId ? (byId.get(scheduleTaskId) ?? null) : null,
    closeSchedule: () => setScheduleTaskId(null),
    editSchedule: setScheduleTaskId,
    saveSchedule,
    saveCalendarChange,
    retry: () => {
      setFailure(null);
      router.refresh();
    },
  } as const;
}
