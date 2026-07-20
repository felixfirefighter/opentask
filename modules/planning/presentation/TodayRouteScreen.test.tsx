import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TodayProjection } from "../application/public";

import { TodayRouteScreen } from "./TodayRouteScreen";

const mocks = vi.hoisted(() => ({
  createTaskWithSchedule: vi.fn(),
  parseQuickAdd: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("./planning-client-api", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    createPlanningTaskWithSchedule: mocks.createTaskWithSchedule,
    parsePlanningQuickAdd: mocks.parseQuickAdd,
  };
});
vi.mock("./use-planning-projection-freshness", () => ({
  usePlanningProjectionFreshness: () => ({
    announcement: "",
    pendingLocalDateLabel: null,
    refresh: vi.fn(),
  }),
}));

const INBOX_ID = "09d7cb40-9c45-43fc-bb2a-0fa62e920d96";
const TASK_ID = "352493c8-1e29-4dc1-bde7-bffac1c190d2";
const projection: TodayProjection = {
  localDate: "2026-07-20",
  timeZone: "Asia/Singapore",
  nowAt: "2026-07-20T01:00:00.000Z",
  overdue: [],
  timed: [],
  anytime: [],
  remainingCount: 0,
  truncated: false,
  truncationReasons: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createTaskWithSchedule.mockResolvedValue({
    task: { id: TASK_ID, version: 1 },
    schedule: { taskId: TASK_ID },
  });
  mocks.parseQuickAdd.mockImplementation((sourceText: string) =>
    Promise.resolve({
      sourceText,
      suggestions: [
        {
          recognizedText: "tomorrow at 3pm",
          startIndex: 9,
          endIndex: 24,
          schedule: {
            kind: "timed",
            startAt: "2026-07-21T07:00:00.000Z",
            endAt: "2026-07-21T07:00:00.000Z",
            timezone: "Asia/Singapore",
          },
          warnings: [],
        },
      ],
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TodayRouteScreen quick add", () => {
  it("turns application truncation into an explicit read-only partial route", () => {
    renderToday({
      ...projection,
      truncated: true,
      truncationReasons: ["recurrence_request_candidate_limit"],
    });

    expect(screen.getByRole("alert")).toHaveTextContent("This planning view is incomplete");
    expect(screen.getByRole("alert")).toHaveTextContent("recurrence calculation");
    expect(screen.getByRole("textbox", { name: "Add a task" })).toBeDisabled();
  });

  it("uses today's all-day schedule when no date is recognized", async () => {
    const user = userEvent.setup();
    mocks.parseQuickAdd.mockImplementation((sourceText: string) =>
      Promise.resolve({ sourceText, suggestions: [] }),
    );
    renderToday();

    await user.type(screen.getByRole("textbox", { name: "Add a task" }), "Prepare demo notes");
    await waitFor(() => expect(mocks.parseQuickAdd).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() =>
      expect(mocks.createTaskWithSchedule).toHaveBeenCalledWith(expect.any(String), {
        title: "Prepare demo notes",
        listId: INBOX_ID,
        schedule: { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-21" },
      }),
    );
    expect(await screen.findByText("Task added to Today.")).toBeInTheDocument();
  });

  it("edits a recognized schedule before save without changing the source title", async () => {
    const user = userEvent.setup();
    renderToday();

    const input = screen.getByRole("textbox", { name: "Add a task" });
    await user.type(input, "Call Sam tomorrow at 3pm");
    const edit = await screen.findByRole("button", {
      name: "Edit recognized value tomorrow at 3pm",
    });
    await user.click(edit);

    expect(screen.getByRole("dialog", { name: "Edit schedule" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Start"), { target: { value: "2026-07-21T16:00" } });
    fireEvent.change(screen.getByLabelText("End"), { target: { value: "2026-07-21T17:00" } });
    await user.click(screen.getByRole("button", { name: "Save schedule" }));

    expect(input).toHaveValue("Call Sam tomorrow at 3pm");
    expect(
      screen.getByRole("button", {
        name: /Edit recognized value tomorrow at 3pm · Jul 21, 4:00 PM–5:00 PM/u,
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add task" }));
    await waitFor(() =>
      expect(mocks.createTaskWithSchedule).toHaveBeenCalledWith(expect.any(String), {
        title: "Call Sam tomorrow at 3pm",
        listId: INBOX_ID,
        schedule: {
          kind: "timed",
          startAt: "2026-07-21T08:00:00Z",
          endAt: "2026-07-21T09:00:00Z",
          timezone: "Asia/Singapore",
        },
      }),
    );
  });

  it("freezes the visible default and create key while a delayed parse resolves", async () => {
    const user = userEvent.setup();
    const dispatchEvent = vi.spyOn(window, "dispatchEvent");
    const parse = deferred<Awaited<ReturnType<typeof mocks.parseQuickAdd>>>();
    const create = deferred<{ task: { id: string; version: number }; schedule: { taskId: string } }>();
    const randomUUID = vi.fn(() => "2f956a36-d88e-41e1-9460-e8d9f4cd8991");
    vi.stubGlobal("crypto", { randomUUID });
    mocks.parseQuickAdd.mockReturnValueOnce(parse.promise);
    mocks.createTaskWithSchedule
      .mockReturnValueOnce(create.promise)
      .mockResolvedValueOnce({ task: { id: TASK_ID, version: 1 }, schedule: { taskId: TASK_ID } });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <TodayRouteScreen hourCycle="12" inboxId={INBOX_ID} projection={projection} />
      </QueryClientProvider>,
    );

    const input = screen.getByRole("textbox", { name: "Add a task" });
    const submit = screen.getByRole("button", { name: "Add task" });
    await user.type(input, "Call Sam tomorrow at 3pm");
    await waitFor(() => expect(mocks.parseQuickAdd).toHaveBeenCalledOnce());
    await user.click(submit);
    await waitFor(() => expect(mocks.createTaskWithSchedule).toHaveBeenCalledOnce());

    parse.resolve({
      sourceText: "Call Sam tomorrow at 3pm",
      suggestions: [
        {
          recognizedText: "tomorrow at 3pm",
          startIndex: 9,
          endIndex: 24,
          schedule: {
            kind: "timed",
            startAt: "2026-07-21T07:00:00.000Z",
            endAt: "2026-07-21T08:00:00.000Z",
            timezone: "Asia/Singapore",
          },
          warnings: [],
        },
      ],
    });
    create.reject(new TypeError("response lost"));

    await waitFor(() => expect(input).toBeDisabled());
    expect(screen.getByRole("alert")).toHaveTextContent("create outcome could not be confirmed");
    expect(screen.queryByText(/Planning could not be refreshed/u)).not.toBeInTheDocument();
    expect(input).toHaveValue("Call Sam tomorrow at 3pm");
    expect(screen.queryByRole("button", { name: /Edit recognized value/u })).not.toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls.some(([event]) => event.type === "opentask:workspace-data-changed")).toBe(
      true,
    );

    view.rerender(
      <QueryClientProvider client={queryClient}>
        <TodayRouteScreen
          hourCycle="12"
          inboxId={INBOX_ID}
          projection={{
            ...projection,
            localDate: "2026-07-21",
            timeZone: "America/New_York",
          }}
        />
      </QueryClientProvider>,
    );
    await user.click(submit);
    await waitFor(() => expect(mocks.createTaskWithSchedule).toHaveBeenCalledTimes(2));

    expect(mocks.createTaskWithSchedule.mock.calls[0]).toEqual([
      "2f956a36-d88e-41e1-9460-e8d9f4cd8991",
      {
        title: "Call Sam tomorrow at 3pm",
        listId: INBOX_ID,
        schedule: { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-21" },
      },
    ]);
    expect(mocks.createTaskWithSchedule.mock.calls[1]).toEqual(mocks.createTaskWithSchedule.mock.calls[0]);
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("uses the current projection default while a prior-timezone suggestion is being reparsed", async () => {
    const user = userEvent.setup();
    const reparse = deferred<Awaited<ReturnType<typeof mocks.parseQuickAdd>>>();
    mocks.parseQuickAdd
      .mockResolvedValueOnce({
        sourceText: "Meet tomorrow",
        suggestions: [
          {
            recognizedText: "tomorrow",
            startIndex: 5,
            endIndex: 13,
            schedule: {
              kind: "all_day",
              startDate: "2026-07-21",
              endDate: "2026-07-22",
            },
            warnings: [],
          },
        ],
      })
      .mockReturnValueOnce(reparse.promise);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <TodayRouteScreen hourCycle="12" inboxId={INBOX_ID} projection={projection} />
      </QueryClientProvider>,
    );
    const input = screen.getByRole("textbox", { name: "Add a task" });
    await user.type(input, "Meet tomorrow");
    await screen.findByRole("button", { name: "Edit recognized value tomorrow" });

    const nextProjection = { ...projection, timeZone: "America/New_York" };
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <TodayRouteScreen hourCycle="12" inboxId={INBOX_ID} projection={nextProjection} />
      </QueryClientProvider>,
    );

    expect(screen.queryByRole("button", { name: /Edit recognized value/u })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add task" }));
    await waitFor(() =>
      expect(mocks.createTaskWithSchedule).toHaveBeenLastCalledWith(expect.any(String), {
        title: "Meet tomorrow",
        listId: INBOX_ID,
        schedule: { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-21" },
      }),
    );
  });
});

function renderToday(source: TodayProjection = projection) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TodayRouteScreen hourCycle="12" inboxId={INBOX_ID} projection={source} />
    </QueryClientProvider>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
