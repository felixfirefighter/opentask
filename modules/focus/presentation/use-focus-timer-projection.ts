"use client";

import { useEffect, useState } from "react";

import type { FocusTimerSnapshot } from "../application/contracts";

type ProjectionTick = Readonly<{
  elapsedSeconds: number;
  snapshotKey: string | null;
}>;

export function useFocusTimerProjectionSeconds(
  snapshot: FocusTimerSnapshot | null | undefined,
  readMonotonicMilliseconds: () => number = systemMonotonicMilliseconds,
): number {
  const snapshotKey = activeSnapshotKey(snapshot);
  const [tick, setTick] = useState<ProjectionTick>({ elapsedSeconds: 0, snapshotKey });

  useEffect(() => {
    if (snapshotKey === null) return;
    const baselineMilliseconds = readMonotonicMilliseconds();
    const interval = window.setInterval(() => {
      const elapsedSeconds = Math.max(
        0,
        Math.floor((readMonotonicMilliseconds() - baselineMilliseconds) / 1_000),
      );
      setTick((current) =>
        current.snapshotKey === snapshotKey && current.elapsedSeconds === elapsedSeconds
          ? current
          : { elapsedSeconds, snapshotKey },
      );
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [readMonotonicMilliseconds, snapshotKey]);

  return tick.snapshotKey === snapshotKey ? tick.elapsedSeconds : 0;
}

function activeSnapshotKey(snapshot: FocusTimerSnapshot | null | undefined): string | null {
  if (!snapshot || snapshot.session.state !== "active") return null;
  return [
    snapshot.session.id,
    snapshot.session.version,
    snapshot.authoritativeAt,
    snapshot.elapsedActiveSeconds,
  ].join(":");
}

function systemMonotonicMilliseconds(): number {
  return performance.now();
}
