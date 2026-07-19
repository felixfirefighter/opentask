"use client";

import { useEffect } from "react";

const dirtyAreas = new Set<string>();
const pendingAreas = new Set<string>();
const activeWriteAreas = new Set<string>();

export function useTaskDraftGuard(taskId: string, area: string, dirty: boolean, pending = false) {
  const key = draftKey(taskId, area);

  useEffect(() => {
    if (dirty) dirtyAreas.add(key);
    else dirtyAreas.delete(key);
    return () => {
      dirtyAreas.delete(key);
    };
  }, [dirty, key]);

  useEffect(() => {
    if (pending) pendingAreas.add(key);
    else pendingAreas.delete(key);
    return () => {
      pendingAreas.delete(key);
    };
  }, [key, pending]);

  useEffect(
    () => () => {
      activeWriteAreas.delete(key);
    },
    [key],
  );

  return {
    beginWrite() {
      if (pendingAreas.has(key) || activeWriteAreas.has(key)) return false;
      activeWriteAreas.add(key);
      return true;
    },
    finishWrite() {
      activeWriteAreas.delete(key);
    },
  } as const;
}

export function useTaskBeforeUnload(taskId: string) {
  useEffect(() => {
    function preventUnsavedExit(event: BeforeUnloadEvent) {
      if (!hasTaskDraft(taskId)) return;
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", preventUnsavedExit);
    return () => window.removeEventListener("beforeunload", preventUnsavedExit);
  }, [taskId]);
}

export function useTaskHistoryGuard(taskId: string) {
  useEffect(() => {
    let restoring = false;
    function confirmHistoryNavigation() {
      if (restoring) {
        restoring = false;
        return;
      }
      if (confirmTaskDraftNavigation(taskId)) return;
      restoring = true;
      window.history.forward();
    }

    window.addEventListener("popstate", confirmHistoryNavigation);
    return () => window.removeEventListener("popstate", confirmHistoryNavigation);
  }, [taskId]);
}

export function hasTaskDraft(taskId?: string, area?: string): boolean {
  if (taskId && area) {
    const key = draftKey(taskId, area);
    return dirtyAreas.has(key) || pendingAreas.has(key) || activeWriteAreas.has(key);
  }
  const prefix = taskId ? `${taskId}:` : "";
  return [...dirtyAreas, ...pendingAreas, ...activeWriteAreas].some((key) => key.startsWith(prefix));
}

export function confirmTaskDraftNavigation(taskId?: string, area?: string): boolean {
  if (!hasTaskDraft(taskId, area)) return true;
  if (typeof window === "undefined") return false;
  const keys = matchingDraftKeys(taskId, area);
  if (keys.some((key) => pendingAreas.has(key) || activeWriteAreas.has(key))) {
    window.alert("Wait for the current task change to finish before leaving.");
    return false;
  }
  if (!window.confirm("Discard unsaved task changes? Your latest saved version will remain available.")) {
    return false;
  }
  for (const key of keys) {
    dirtyAreas.delete(key);
  }
  return true;
}

export function clearTaskDrafts(taskId: string) {
  for (const areas of [dirtyAreas, pendingAreas, activeWriteAreas]) {
    for (const key of areas) {
      if (key.startsWith(`${taskId}:`)) areas.delete(key);
    }
  }
}

function matchingDraftKeys(taskId?: string, area?: string) {
  const exact = taskId && area ? draftKey(taskId, area) : null;
  const prefix = taskId ? `${taskId}:` : "";
  return [...new Set([...dirtyAreas, ...pendingAreas, ...activeWriteAreas])].filter((key) =>
    exact ? key === exact : key.startsWith(prefix),
  );
}

function draftKey(taskId: string, area: string) {
  return `${taskId}:${area}`;
}
