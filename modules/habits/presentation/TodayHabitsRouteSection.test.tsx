import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { HabitTodayProjection } from "../application/contracts";
import { habitTodayRow } from "./habit-presentation-test-support";
import { TodayHabitsRouteSection } from "./TodayHabitsRouteSection";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TodayHabitsRouteSection", () => {
  it("continues after an empty scheduled page and deduplicates overlapping rows", async () => {
    const user = userEvent.setup();
    const firstRow = habitTodayRow();
    const secondRow = anotherTodayRow();
    const initialPage = todayPage([], "today_next");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://opentask.local");
      return url.searchParams.has("cursor")
        ? Response.json({
            rows: [firstRow, firstRow, secondRow],
            boundaries: [{ timezone: "America/New_York", localDate: "2026-07-20" }],
            nextCursor: null,
          })
        : Response.json(initialPage);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderRoute(initialPage);

    expect(await screen.findByText("No scheduled practices are loaded from this page yet.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Load more habits" }));

    expect(await screen.findByRole("link", { name: /Evening stretch/u })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Morning walk|Evening stretch/u })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Load more habits" })).not.toBeInTheDocument();
    const continuationUrl = fetchMock.mock.calls
      .map(([input]) => new URL(String(input), "http://opentask.local"))
      .find((url) => url.searchParams.has("cursor"));
    expect(Object.fromEntries(continuationUrl?.searchParams ?? [])).toEqual({
      cursor: "today_next",
      limit: "50",
    });
  });

  it("retries a transient continuation failure without hiding loaded Today rows", async () => {
    const user = userEvent.setup();
    const firstRow = habitTodayRow();
    const secondRow = anotherTodayRow();
    const initialPage = todayPage([firstRow], "today_next");
    let continuationAttempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "http://opentask.local");
        if (!url.searchParams.has("cursor")) return Response.json(initialPage);
        continuationAttempts += 1;
        return continuationAttempts === 1
          ? habitProblem(503, "INTERNAL", "The next page is temporarily unavailable.")
          : Response.json(todayPage([secondRow], null));
      }),
    );
    renderRoute(initialPage);

    await user.click(await screen.findByRole("button", { name: "Load more habits" }));
    expect(await screen.findByRole("button", { name: "Retry loading more habits" })).toBeEnabled();
    expect(screen.getByRole("link", { name: /Morning walk/u })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry loading more habits" }));
    expect(await screen.findByRole("link", { name: /Evening stretch/u })).toBeInTheDocument();
    expect(continuationAttempts).toBe(2);
  });

  it("refreshes Today from page one after an expired continuation cursor", async () => {
    const user = userEvent.setup();
    const firstRow = habitTodayRow();
    const secondRow = anotherTodayRow();
    const initialPage = todayPage([firstRow], "today_next");
    let firstPageRequests = 0;
    let continuationRequests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "http://opentask.local");
        if (url.searchParams.has("cursor")) {
          continuationRequests += 1;
          return habitProblem(400, "VALIDATION_FAILED", "The habit page cursor is invalid or expired.");
        }
        firstPageRequests += 1;
        return Response.json(firstPageRequests === 1 ? initialPage : todayPage([secondRow], null));
      }),
    );
    renderRoute(initialPage);

    await user.click(await screen.findByRole("button", { name: "Load more habits" }));
    expect(await screen.findByRole("button", { name: "Refresh habits from the beginning" })).toBeEnabled();
    expect(screen.getByRole("link", { name: /Morning walk/u })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Refresh habits from the beginning" }));
    expect(await screen.findByRole("link", { name: /Evening stretch/u })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Morning walk/u })).not.toBeInTheDocument();
    expect(firstPageRequests).toBe(2);
    expect(continuationRequests).toBe(1);
  });
});

function renderRoute(initialProjection: HabitTodayProjection) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TodayHabitsRouteSection initialProjection={initialProjection} />
    </QueryClientProvider>,
  );
}

function todayPage(rows: HabitTodayProjection["rows"], nextCursor: string | null): HabitTodayProjection {
  return {
    rows,
    boundaries: [{ timezone: "Asia/Singapore", localDate: "2026-07-21" }],
    nextCursor,
  };
}

function anotherTodayRow() {
  const original = habitTodayRow();
  const habitId = "aa356793-6ccb-4cc0-956c-0676aa68bf7a";
  return habitTodayRow({
    detail: {
      habit: { ...original.detail.habit, id: habitId, title: "Evening stretch" },
      schedule: { ...original.detail.schedule, habitId },
    },
    streak: { ...original.streak, habitId },
  });
}

function habitProblem(status: number, code: "INTERNAL" | "VALIDATION_FAILED", detail: string) {
  return Response.json(
    {
      type: "https://opentask.local/problems/habit-request",
      title: "Habit request failed",
      status,
      code,
      detail,
      correlationId: "habit-test-correlation",
    },
    { status },
  );
}
