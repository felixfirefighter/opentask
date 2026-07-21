import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { habitDetail, habitOverview } from "./habit-presentation-test-support";
import { HabitWorkspaceRouteScreen } from "./HabitWorkspaceRouteScreen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HabitWorkspaceRouteScreen", () => {
  it("retries an unknown create outcome with one idempotency key without trapping Cancel", async () => {
    const user = userEvent.setup();
    let createAttempt = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && path.includes("/api/v1/habits/overviews")) {
        return Response.json({ items: [], nextCursor: null });
      }
      if (method === "POST" && path === "/api/v1/habits") {
        createAttempt += 1;
        return createAttempt === 1
          ? Response.json({ unreadable: true })
          : Response.json(habitDetail({ title: "Retry-safe habit" }));
      }
      throw new Error(`Unexpected habit request: ${method} ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "8cbdb440-d320-44af-960f-869c8f56811c" });
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <HabitWorkspaceRouteScreen
          initialPage={{ items: [], nextCursor: null }}
          lifecycle="active"
          localDate="2026-07-20"
          timezone="Asia/Singapore"
        />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Create habit" }));
    await user.type(screen.getByRole("textbox", { name: "Title" }), "Retry-safe habit");
    await user.click(screen.getByRole("button", { name: "Create habit" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("outcome could not be confirmed");
    expect(screen.getByRole("button", { name: "Close and review habits" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "Title" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Retry unchanged habit" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Retry unchanged habit" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const creates = fetchMock.mock.calls.filter(
      ([path, init]) => String(path) === "/api/v1/habits" && init?.method === "POST",
    );
    expect(creates).toHaveLength(2);
    expect(new Headers(creates[0]?.[1]?.headers).get("idempotency-key")).toBe(
      "8cbdb440-d320-44af-960f-869c8f56811c",
    );
    expect(new Headers(creates[1]?.[1]?.headers).get("idempotency-key")).toBe(
      "8cbdb440-d320-44af-960f-869c8f56811c",
    );
  });

  it("loads explicit continuation pages and deduplicates overlapping habit rows", async () => {
    const user = userEvent.setup();
    const first = currentHabitOverview();
    const second = anotherHabitOverview();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://opentask.local");
      if (url.searchParams.get("cursor") === "first_page") {
        return Response.json({ items: [first, second], nextCursor: null });
      }
      return Response.json({ items: [first], nextCursor: "first_page" });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderRoute({ items: [first], nextCursor: "first_page" });
    await user.click(await screen.findByRole("button", { name: "Load more habits" }));

    expect(await screen.findByRole("link", { name: "Open Evening stretch" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^Open /u })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Load more habits" })).not.toBeInTheDocument();
    const continuationUrl = fetchMock.mock.calls
      .map(([input]) => new URL(String(input), "http://opentask.local"))
      .find((url) => url.searchParams.has("cursor"));
    expect(Object.fromEntries(continuationUrl?.searchParams ?? [])).toEqual({
      cursor: "first_page",
      limit: "50",
      lifecycle: "active",
    });
  });

  it("retries a transient next-page failure without replacing loaded habits", async () => {
    const user = userEvent.setup();
    const first = currentHabitOverview();
    const second = anotherHabitOverview();
    let continuationAttempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "http://opentask.local");
        if (!url.searchParams.has("cursor")) {
          return Response.json({ items: [first], nextCursor: "first_page" });
        }
        continuationAttempts += 1;
        return continuationAttempts === 1
          ? habitProblem(503, "INTERNAL", "The next page is temporarily unavailable.")
          : Response.json({ items: [second], nextCursor: null });
      }),
    );
    renderRoute({ items: [first], nextCursor: "first_page" });

    await user.click(await screen.findByRole("button", { name: "Load more habits" }));
    expect(await screen.findByRole("button", { name: "Retry loading more habits" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Open Morning walk" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry loading more habits" }));
    expect(await screen.findByRole("link", { name: "Open Evening stretch" })).toBeInTheDocument();
    expect(continuationAttempts).toBe(2);
  });

  it("recovers an expired cursor from page one instead of retrying it forever", async () => {
    const user = userEvent.setup();
    const first = currentHabitOverview();
    const second = anotherHabitOverview();
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
        return firstPageRequests === 1
          ? Response.json({ items: [first], nextCursor: "first_page" })
          : Response.json({ items: [second], nextCursor: null });
      }),
    );
    renderRoute({ items: [first], nextCursor: "first_page" });

    await user.click(await screen.findByRole("button", { name: "Load more habits" }));
    expect(await screen.findByRole("button", { name: "Refresh habits from the beginning" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Open Morning walk" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Refresh habits from the beginning" }));
    expect(await screen.findByRole("link", { name: "Open Evening stretch" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open Morning walk" })).not.toBeInTheDocument();
    expect(firstPageRequests).toBe(2);
    expect(continuationRequests).toBe(1);
  });
});

function renderRoute(initialPage: { items: ReturnType<typeof habitOverview>[]; nextCursor: string | null }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HabitWorkspaceRouteScreen
        initialPage={initialPage}
        lifecycle="active"
        localDate="2026-07-20"
        timezone="Asia/Singapore"
      />
    </QueryClientProvider>,
  );
}

function anotherHabitOverview() {
  const original = currentHabitOverview();
  const habitId = "aa356793-6ccb-4cc0-956c-0676aa68bf7a";
  return currentHabitOverview({
    detail: {
      habit: { ...original.detail.habit, id: habitId, title: "Evening stretch" },
      schedule: { ...original.detail.schedule, habitId },
    },
    streak: { ...original.streak, habitId },
  });
}

function currentHabitOverview(overrides: Parameters<typeof habitOverview>[0] = {}) {
  const original = habitOverview();
  return habitOverview({
    localDate: "2026-07-21",
    today: { ...original.today, localDate: "2026-07-21" },
    ...overrides,
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
