"use client";

import { useEffect, useRef } from "react";

export function useTaskRecurrenceVersionFence({
  paused,
  recurrenceVersion,
  refetchAll,
  taskVersion,
}: Readonly<{
  paused: boolean;
  recurrenceVersion: number | null;
  refetchAll: () => Promise<unknown>;
  taskVersion: number;
}>) {
  const versionMismatch = recurrenceVersion !== null && recurrenceVersion !== taskVersion;
  const refreshAttempt = useRef<string | null>(null);

  useEffect(() => {
    if (!versionMismatch) {
      refreshAttempt.current = null;
      return;
    }
    if (paused) return;
    const attempt = `${taskVersion}:${recurrenceVersion}`;
    if (refreshAttempt.current === attempt) return;
    refreshAttempt.current = attempt;
    void refetchAll();
  }, [paused, recurrenceVersion, refetchAll, taskVersion, versionMismatch]);

  function refreshLatest() {
    refreshAttempt.current = null;
    return refetchAll();
  }

  return { refreshLatest, versionMismatch } as const;
}
