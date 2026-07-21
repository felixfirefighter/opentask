import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  localDateAt,
  millisecondsUntilEarliestLocalMidnight,
  millisecondsUntilNextLocalMidnight,
  type HabitFreshnessBoundary,
  useHabitProjectionFreshness,
} from "./use-habit-projection-freshness";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  mocks.refresh.mockClear();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("habit projection freshness", () => {
  it("refreshes once at the earliest midnight across active timezones", () => {
    vi.setSystemTime("2026-07-20T15:59:59.900Z");
    const boundaries = [
      { timezone: "Asia/Singapore", localDate: "2026-07-20" },
      { timezone: "America/New_York", localDate: "2026-07-20" },
    ] as const;
    const { invalidate } = renderHarness(boundaries);

    expect(millisecondsUntilEarliestLocalMidnight(Date.now(), boundaries)).toBe(100);
    act(() => vi.advanceTimersByTime(151));

    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("Habit dates changed");
  });

  it("uses Temporal local midnights across the New York spring-forward day", () => {
    const localMidnight = Date.parse("2026-03-08T05:00:00.000Z");

    expect(localDateAt(localMidnight, "America/New_York")).toBe("2026-03-08");
    expect(millisecondsUntilNextLocalMidnight(localMidnight, "America/New_York")).toBe(23 * 60 * 60 * 1_000);
  });

  it("catches a missed boundary and deduplicates focus, visibility, and online until data catches up", () => {
    vi.setSystemTime("2026-07-20T12:00:00.000Z");
    const rendered = renderHarness([{ timezone: "Asia/Singapore", localDate: "2026-07-20" }]);

    vi.setSystemTime("2026-07-21T01:00:00.000Z");
    act(() => window.dispatchEvent(new Event("focus")));
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    act(() => window.dispatchEvent(new Event("online")));

    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(rendered.invalidate).toHaveBeenCalledOnce();
    rendered.rerenderBoundaries([{ timezone: "Asia/Singapore", localDate: "2026-07-21" }]);
    expect(screen.getByRole("status")).toHaveTextContent("Habit dates refreshed");

    vi.setSystemTime("2026-07-21T16:00:01.000Z");
    act(() => window.dispatchEvent(new Event("focus")));
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
    expect(rendered.invalidate).toHaveBeenCalledTimes(2);
  });

  it("refreshes immediately when mounted with stale projection boundaries", () => {
    vi.setSystemTime("2026-07-21T01:00:00.000Z");
    const { invalidate } = renderHarness([{ timezone: "Asia/Singapore", localDate: "2026-07-20" }]);

    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it.each(["focus", "visibilitychange"] as const)(
    "retries stale boundaries on a later %s recovery event without duplicating its event burst",
    (eventName) => {
      vi.setSystemTime("2026-07-21T01:00:00.000Z");
      const { invalidate } = renderHarness([{ timezone: "Asia/Singapore", localDate: "2026-07-20" }]);

      expect(mocks.refresh).toHaveBeenCalledOnce();
      act(() => vi.advanceTimersByTime(1_001));
      act(() => {
        if (eventName === "focus") window.dispatchEvent(new Event(eventName));
        else document.dispatchEvent(new Event(eventName));
      });
      act(() => window.dispatchEvent(new Event("focus")));

      expect(mocks.refresh).toHaveBeenCalledTimes(2);
      expect(invalidate).toHaveBeenCalledTimes(2);
    },
  );

  it("retries immediately on reconnect when the first stale refresh happened offline", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    vi.setSystemTime("2026-07-21T01:00:00.000Z");
    const rendered = renderHarness([{ timezone: "Asia/Singapore", localDate: "2026-07-20" }]);

    expect(mocks.refresh).toHaveBeenCalledOnce();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    act(() => window.dispatchEvent(new Event("online")));
    act(() => document.dispatchEvent(new Event("visibilitychange")));

    expect(mocks.refresh).toHaveBeenCalledTimes(2);
    expect(rendered.invalidate).toHaveBeenCalledTimes(2);
    rendered.rerenderBoundaries([{ timezone: "Asia/Singapore", localDate: "2026-07-21" }]);
    expect(screen.getByRole("status")).toHaveTextContent("Habit dates refreshed");
  });
});

function renderHarness(initialBoundaries: readonly HabitFreshnessBoundary[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const element = (boundaries: readonly HabitFreshnessBoundary[]) => (
    <QueryClientProvider client={client}>
      <Harness boundaries={boundaries} />
    </QueryClientProvider>
  );
  const rendered = render(element(initialBoundaries));
  return {
    invalidate,
    rerenderBoundaries(boundaries: readonly HabitFreshnessBoundary[]) {
      rendered.rerender(element(boundaries));
    },
  };
}

function Harness({ boundaries }: Readonly<{ boundaries: readonly HabitFreshnessBoundary[] }>) {
  const freshness = useHabitProjectionFreshness(boundaries);
  return <span role="status">{freshness.announcement}</span>;
}
