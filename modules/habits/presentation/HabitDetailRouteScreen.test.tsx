import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  habitDetail,
  habitLog,
  habitMonth,
  habitOverview,
  TEST_HABIT_ID,
} from "./habit-presentation-test-support";
import { HabitDetailRouteScreen } from "./HabitDetailRouteScreen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HabitDetailRouteScreen", () => {
  it("refreshes the dedicated single-habit overview after a check-in mutation", async () => {
    const user = userEvent.setup();
    const initialOverview = currentOverview();
    const refreshedOverview = currentOverview({
      streak: { ...initialOverview.streak, current: 7, best: 7 },
    });
    let overviewReads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        const method = init?.method ?? "GET";
        if (method === "POST" && path.endsWith("/logs")) {
          return Response.json({ outcome: "created", log: habitLog() });
        }
        if (method === "GET" && path.endsWith("/overview")) {
          overviewReads += 1;
          return Response.json(overviewReads === 1 ? initialOverview : refreshedOverview);
        }
        if (method === "GET" && path.includes("/month?")) return Response.json(habitMonth());
        if (method === "GET" && path === `/api/v1/habits/${TEST_HABIT_ID}`) {
          return Response.json(habitDetail());
        }
        throw new Error(`Unexpected habit request: ${method} ${path}`);
      }),
    );
    vi.stubGlobal("crypto", { randomUUID: () => "5e63d7bb-b861-4ca4-8e67-80d0456e0d08" });
    renderRoute(initialOverview);

    await user.click(screen.getByRole("button", { name: "Check in" }));

    expect(await screen.findByText(/Current 7 days/u)).toBeInTheDocument();
    expect(overviewReads).toBeGreaterThanOrEqual(2);
  });

  it("keeps the server overview visible but read-only when its bounded refresh fails", async () => {
    const initialOverview = currentOverview();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path.endsWith("/overview")) {
          return Response.json(
            {
              type: "https://opentask.local/problems/habit-request",
              title: "Habit request failed",
              status: 503,
              code: "INTERNAL",
              detail: "The habit overview is temporarily unavailable.",
              correlationId: "habit-test-correlation",
            },
            { status: 503 },
          );
        }
        if (path.includes("/month?")) return Response.json(habitMonth());
        if (path === `/api/v1/habits/${TEST_HABIT_ID}`) return Response.json(habitDetail());
        throw new Error(`Unexpected habit request: GET ${path}`);
      }),
    );
    renderRoute(initialOverview);

    expect(await screen.findByRole("button", { name: "Retry" })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "Morning walk" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit habit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Check in" })).toBeDisabled();
  });
});

function renderRoute(initialOverview: ReturnType<typeof habitOverview>) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <HabitDetailRouteScreen initialMonth={habitMonth()} initialOverview={initialOverview} />
    </QueryClientProvider>,
  );
}

function currentOverview(overrides: Parameters<typeof habitOverview>[0] = {}) {
  const original = habitOverview();
  return habitOverview({
    localDate: "2026-07-21",
    today: { ...original.today, localDate: "2026-07-21" },
    streak: { ...original.streak, evaluatedThrough: "2026-07-21" },
    ...overrides,
  });
}
