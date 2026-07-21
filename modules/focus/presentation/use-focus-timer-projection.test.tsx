import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FocusTimerSnapshot } from "../application/contracts";
import { focusTimerView } from "./focus-view-model";
import { useFocusTimerProjectionSeconds } from "./use-focus-timer-projection";

describe("useFocusTimerProjectionSeconds", () => {
  afterEach(() => vi.useRealTimers());

  it("projects from a monotonic snapshot baseline despite hostile wall-clock jumps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T00:00:00.000Z"));
    let monotonicMilliseconds = 10_000;
    const readMonotonicMilliseconds = () => monotonicMilliseconds;
    const initial = activeSnapshot({ elapsedActiveSeconds: 120, version: 3 });
    const view = renderHook(
      ({ snapshot }) => {
        const projected = useFocusTimerProjectionSeconds(snapshot, readMonotonicMilliseconds);
        return focusTimerView(snapshot, timerSetup, projected);
      },
      { initialProps: { snapshot: initial } },
    );

    expect(view.result.current).toMatchObject({ displayedElapsedSeconds: 120 });

    act(() => {
      vi.setSystemTime(new Date("2099-01-01T00:00:00.000Z"));
      monotonicMilliseconds += 2_200;
      vi.advanceTimersByTime(1_000);
    });
    expect(view.result.current).toMatchObject({ displayedElapsedSeconds: 122 });

    act(() => {
      vi.setSystemTime(new Date("1970-01-01T00:00:00.000Z"));
      vi.advanceTimersByTime(1_000);
    });
    expect(view.result.current).toMatchObject({ displayedElapsedSeconds: 122 });

    const refreshed = activeSnapshot({ elapsedActiveSeconds: 300, version: 4 });
    view.rerender({ snapshot: refreshed });
    expect(view.result.current).toMatchObject({ displayedElapsedSeconds: 300 });

    act(() => {
      monotonicMilliseconds += 1_000;
      vi.advanceTimersByTime(1_000);
    });
    expect(view.result.current).toMatchObject({ displayedElapsedSeconds: 301 });
  });
});

const timerSetup = {
  mode: "pomodoro" as const,
  focusPlannedSeconds: 1_500,
  breakPlannedSeconds: 300,
  link: null,
};

function activeSnapshot({
  elapsedActiveSeconds,
  version,
}: Readonly<{ elapsedActiveSeconds: number; version: number }>): FocusTimerSnapshot {
  const authoritativeAt = `2026-07-21T00:${version === 3 ? "00" : "05"}:00.000Z`;
  return {
    session: {
      id: "323b28cf-c8c2-41d6-846b-bb59d696b47c",
      kind: "focus",
      mode: "pomodoro",
      state: "active",
      taskId: null,
      habitId: null,
      startedAt: authoritativeAt,
      pausedAt: null,
      accumulatedActiveSeconds: elapsedActiveSeconds,
      plannedSeconds: 1_500,
      endedAt: null,
      version,
      createdAt: "2026-07-21T00:00:00.000Z",
      updatedAt: authoritativeAt,
    },
    link: null,
    authoritativeAt,
    elapsedActiveSeconds,
    remainingSeconds: 1_500 - elapsedActiveSeconds,
    overtimeSeconds: 0,
    planReached: false,
  };
}
