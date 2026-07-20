import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  localDateAt,
  millisecondsUntilNextLocalDate,
  usePlanningProjectionFreshness,
} from "./use-planning-projection-freshness";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  mocks.refresh.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("planning projection freshness", () => {
  it("refreshes at the next Singapore local midnight and confirms the updated projection", () => {
    vi.setSystemTime("2026-07-20T15:59:59.900Z");
    const view = render(<Harness projectedLocalDate="2026-07-20" timeZone="Asia/Singapore" />);

    act(() => vi.advanceTimersByTime(151));

    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(screen.getByTestId("pending")).toHaveTextContent("Tuesday, July 21");
    expect(screen.getByTestId("announcement")).toHaveTextContent(
      "The local date changed to Tuesday, July 21",
    );

    view.rerender(<Harness projectedLocalDate="2026-07-21" timeZone="Asia/Singapore" />);
    expect(screen.getByTestId("pending")).toBeEmptyDOMElement();
    expect(screen.getByTestId("announcement")).toHaveTextContent(
      "Planning tasks refreshed for Tuesday, July 21",
    );
  });

  it("uses the saved New York timezone across the spring-forward local day", () => {
    const localMidnight = Date.parse("2026-03-08T05:00:00.000Z");
    expect(localDateAt(localMidnight, "America/New_York")).toBe("2026-03-08");
    expect(millisecondsUntilNextLocalDate(localMidnight, "America/New_York")).toBe(23 * 60 * 60 * 1_000);

    vi.setSystemTime(localMidnight);
    render(<Harness projectedLocalDate="2026-03-08" timeZone="America/New_York" />);
    act(() => vi.advanceTimersByTime(23 * 60 * 60 * 1_000 + 51));

    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(screen.getByTestId("pending")).toHaveTextContent("Monday, March 9");
  });

  it("catches a missed boundary when a backgrounded page receives focus", () => {
    vi.setSystemTime("2026-07-20T12:00:00.000Z");
    render(<Harness projectedLocalDate="2026-07-20" timeZone="Asia/Singapore" />);

    vi.setSystemTime("2026-07-21T01:00:00.000Z");
    act(() => window.dispatchEvent(new Event("focus")));

    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(screen.getByTestId("announcement")).toHaveTextContent("Refreshing planning tasks");

    act(() => window.dispatchEvent(new Event("focus")));
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it("refreshes when a changed saved timezone makes the server projection date stale", () => {
    vi.setSystemTime("2026-07-20T01:00:00.000Z");
    const view = render(<Harness projectedLocalDate="2026-07-20" timeZone="Asia/Singapore" />);

    view.rerender(<Harness projectedLocalDate="2026-07-20" timeZone="America/New_York" />);

    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(screen.getByTestId("pending")).toHaveTextContent("Sunday, July 19");
  });

  it("does not resurrect a completed midnight warning after a later timezone change", () => {
    vi.setSystemTime("2026-07-20T16:00:00.000Z");
    const view = render(<Harness projectedLocalDate="2026-07-20" timeZone="Asia/Singapore" />);

    expect(screen.getByTestId("pending")).toHaveTextContent("Tuesday, July 21");
    view.rerender(<Harness projectedLocalDate="2026-07-21" timeZone="Asia/Singapore" />);
    expect(screen.getByTestId("pending")).toBeEmptyDOMElement();
    expect(screen.getByTestId("announcement")).toHaveTextContent(
      "Planning tasks refreshed for Tuesday, July 21",
    );

    view.rerender(<Harness projectedLocalDate="2026-07-20" timeZone="America/New_York" />);
    expect(screen.getByTestId("pending")).toBeEmptyDOMElement();
    expect(screen.getByTestId("announcement")).toBeEmptyDOMElement();
  });
});

function Harness({ projectedLocalDate, timeZone }: { projectedLocalDate: string; timeZone: string }) {
  const freshness = usePlanningProjectionFreshness({ projectedLocalDate, timeZone });
  return (
    <>
      <span data-testid="pending">{freshness.pendingLocalDateLabel}</span>
      <span data-testid="announcement">{freshness.announcement}</span>
    </>
  );
}
