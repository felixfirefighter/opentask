import type { InstantInterval } from "./scheduler-model";

export function intervalsOverlap(left: InstantInterval, right: InstantInterval): boolean {
  return left.start < right.end && right.start < left.end;
}

export function intervalGap(left: InstantInterval, right: InstantInterval): bigint {
  if (intervalsOverlap(left, right)) {
    return -1n;
  }

  return left.end <= right.start ? right.start - left.end : left.start - right.end;
}

export function intervalIsContained(
  interval: InstantInterval,
  containers: readonly InstantInterval[],
): boolean {
  return containers.some((container) => {
    if (interval.start === interval.end) {
      return interval.start >= container.start && interval.start < container.end;
    }

    return interval.start >= container.start && interval.end <= container.end;
  });
}

export function sortIntervals(intervals: readonly InstantInterval[]): InstantInterval[] {
  return [...intervals].sort((left, right) => {
    if (left.start !== right.start) {
      return left.start < right.start ? -1 : 1;
    }

    if (left.end === right.end) {
      return 0;
    }

    return left.end < right.end ? -1 : 1;
  });
}

export function workWindowsOverlap(windows: readonly InstantInterval[]): boolean {
  const ordered = sortIntervals(windows);

  return ordered.some((window, index) => {
    const previous = ordered[index - 1];
    return previous !== undefined && window.start < previous.end;
  });
}

export function freeIntervals(
  window: InstantInterval,
  occupied: readonly InstantInterval[],
  buffer: bigint,
): InstantInterval[] {
  const blocked = mergeIntervals(
    occupied
      .map((interval) => ({ start: interval.start - buffer, end: interval.end + buffer }))
      .filter((interval) => interval.end > window.start && interval.start < window.end)
      .map((interval) => ({
        start: interval.start < window.start ? window.start : interval.start,
        end: interval.end > window.end ? window.end : interval.end,
      }))
      .filter((interval) => interval.end > interval.start),
  );
  const free: InstantInterval[] = [];
  let cursor = window.start;

  for (const interval of blocked) {
    if (interval.start > cursor) {
      free.push({ start: cursor, end: interval.start });
    }

    if (interval.end > cursor) {
      cursor = interval.end;
    }
  }

  if (cursor < window.end) {
    free.push({ start: cursor, end: window.end });
  }

  return free;
}

function mergeIntervals(intervals: readonly InstantInterval[]): InstantInterval[] {
  const ordered = sortIntervals(intervals);
  const merged: InstantInterval[] = [];

  for (const interval of ordered) {
    const previous = merged.at(-1);

    if (previous === undefined || interval.start > previous.end) {
      merged.push({ ...interval });
      continue;
    }

    if (interval.end > previous.end) {
      merged[merged.length - 1] = { start: previous.start, end: interval.end };
    }
  }

  return merged;
}
