import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskDetailDto, TaskOccurrenceDto } from "../application/contracts";

const mocks = vi.hoisted(() => ({ get: vi.fn(), refresh: vi.fn(), transition: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("./data/task-occurrence-api-client", () => ({
  getTaskOccurrence: mocks.get,
  transitionTaskOccurrence: mocks.transition,
}));

import { TaskOccurrencePanel } from "./TaskOccurrencePanel";

const TASK_ID = "00000000-0000-4000-8000-000000000010";
let savedOccurrence: TaskOccurrenceDto | null;

beforeEach(() => {
  vi.clearAllMocks();
  savedOccurrence = occurrence();
  mocks.get.mockImplementation(async () => savedOccurrence);
  mocks.transition.mockImplementation(async (_taskId, request) => {
    const occurrenceState =
      request.action === "complete" ? "completed" : request.action === "skip" ? "skipped" : "open";
    savedOccurrence = savedOccurrence
      ? { ...savedOccurrence, occurrenceState, taskVersion: request.expectedVersion + 1 }
      : null;
    return {
      outcome: "applied",
      action: request.action,
      occurrenceKey: request.occurrenceKey,
      expectedVersion: request.expectedVersion,
      task: { id: TASK_ID, version: request.expectedVersion + 1 },
      occurrenceState,
      eventTaskVersion: request.expectedVersion + 1,
    };
  });
});

describe("TaskOccurrencePanel", () => {
  it("shows authoritative occurrence metadata and changes only that occurrence", async () => {
    const user = userEvent.setup();
    const view = renderPanel();

    expect(screen.getByRole("heading", { name: "Selected occurrence" })).toBeVisible();
    expect(screen.getByText("Monday, July 20 · 10:00 AM–11:00 AM · Asia/Singapore")).toBeVisible();
    expect(screen.getByText("These actions change only this occurrence, not the series.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Complete occurrence" }));

    expect(mocks.transition).toHaveBeenCalledWith(TASK_ID, {
      action: "complete",
      occurrenceKey: "o1.current",
      expectedVersion: 4,
    });
    expect(await screen.findByText("Completed", { exact: true })).toBeVisible();
    expect(screen.getByRole("button", { name: "Undo occurrence" })).toBeVisible();
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());

    view.rerenderPanel({ ...occurrence(), occurrenceState: "completed", taskVersion: 5 }, task(5));
    await user.click(screen.getByRole("button", { name: "Undo occurrence" }));
    expect(mocks.transition).toHaveBeenLastCalledWith(TASK_ID, {
      action: "undo",
      occurrenceKey: "o1.current",
      expectedVersion: 5,
    });
  });

  it("shows both local dates when a timed occurrence crosses midnight and a DST boundary", () => {
    const selectedOccurrence: TaskOccurrenceDto = {
      ...occurrence(),
      schedule: {
        kind: "timed",
        startAt: "2026-11-01T03:30:00.000Z",
        endAt: "2026-11-01T06:30:00.000Z",
        timezone: "America/New_York",
      },
    };
    savedOccurrence = selectedOccurrence;

    renderPanel(false, task(), undefined, selectedOccurrence);

    expect(
      screen.getByText("Saturday, October 31 · 11:30 PM–Sunday, November 1 · 1:30 AM · America/New_York"),
    ).toBeVisible();
  });

  it("uses the saved 24-hour clock preference for selected occurrence times", () => {
    renderPanel(false, task(), undefined, occurrence(), "h23");

    expect(screen.getByText("Monday, July 20 · 10:00–11:00 · Asia/Singapore")).toBeVisible();
    expect(screen.queryByText(/AM/u)).not.toBeInTheDocument();
  });

  it("refreshes an occurrence snapshot that trails a same-page task mutation before enabling actions", async () => {
    const user = userEvent.setup();
    savedOccurrence = { ...occurrence(), taskVersion: 9 };
    renderPanel(false, task(9));

    const complete = screen.getByRole("button", { name: "Complete occurrence" });
    await waitFor(() => expect(complete).toBeEnabled());
    await user.click(complete);

    expect(mocks.transition).toHaveBeenCalledWith(TASK_ID, {
      action: "complete",
      occurrenceKey: "o1.current",
      expectedVersion: 9,
    });
  });

  it("gates terminal actions while a newer occurrence snapshot refreshes its older task", async () => {
    const refetchTask = vi.fn(async () => undefined);
    savedOccurrence = { ...occurrence(), occurrenceState: "completed", taskVersion: 5 };
    renderPanel(false, task(4), {
      error: false,
      fetching: false,
      refetch: refetchTask,
    });

    await waitFor(() => expect(refetchTask).toHaveBeenCalledOnce());
    expect(await screen.findByText("Completed", { exact: true })).toBeVisible();
    expect(screen.getByRole("button", { name: "Undo occurrence" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Loading latest task and occurrence");
  });

  it("keeps a response-lost action unconfirmed and retries the exact command", async () => {
    const user = userEvent.setup();
    mocks.transition
      .mockImplementationOnce(async (_taskId, request) => {
        savedOccurrence = {
          ...occurrence(),
          occurrenceState: "completed",
          taskVersion: request.expectedVersion + 1,
        };
        throw new TypeError("response lost");
      })
      .mockResolvedValueOnce({
        outcome: "idempotent_retry",
        action: "complete",
        occurrenceKey: "o1.current",
        expectedVersion: 4,
        task: { id: TASK_ID, version: 5 },
        occurrenceState: "completed",
        eventTaskVersion: 5,
      });
    const view = renderPanel();

    await user.click(screen.getByRole("button", { name: "Complete occurrence" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The occurrence-change outcome could not be confirmed",
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Undo occurrence" })).toBeDisabled();

    view.rerenderPanel({ ...occurrence(), occurrenceState: "completed", taskVersion: 5 }, task(5));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The occurrence-change outcome could not be confirmed",
    );
    expect(screen.getByRole("button", { name: "Retry exact occurrence change" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Retry exact occurrence change" }));

    await waitFor(() => expect(mocks.transition).toHaveBeenCalledTimes(2));
    expect(mocks.transition.mock.calls[1]).toEqual([
      TASK_ID,
      { action: "complete", occurrenceKey: "o1.current", expectedVersion: 4 },
    ]);
    expect(await screen.findByText("Occurrence saved")).toBeVisible();
  });

  it("keeps stale occurrence actions fenced when an exact retry reports later task changes", async () => {
    const user = userEvent.setup();
    mocks.transition
      .mockImplementationOnce(async (_taskId, request) => {
        savedOccurrence = {
          ...occurrence(),
          occurrenceState: "completed",
          taskVersion: request.expectedVersion + 1,
        };
        throw new TypeError("response lost");
      })
      .mockResolvedValueOnce({
        outcome: "idempotent_retry",
        action: "complete",
        occurrenceKey: "o1.current",
        expectedVersion: 4,
        task: { id: TASK_ID, version: 8 },
        occurrenceState: "completed",
        eventTaskVersion: 5,
      });
    const view = renderPanel();

    await user.click(screen.getByRole("button", { name: "Complete occurrence" }));
    expect(await screen.findByRole("button", { name: "Retry exact occurrence change" })).toBeVisible();

    view.rerenderPanel({ ...occurrence(), occurrenceState: "completed", taskVersion: 5 }, task(5));
    mocks.get.mockRejectedValueOnce(new TypeError("refresh failed"));
    await user.click(screen.getByRole("button", { name: "Retry exact occurrence change" }));

    await waitFor(() => expect(mocks.transition).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("button", { name: "Undo occurrence" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Latest task and occurrence state unavailable");
    expect(screen.getByRole("button", { name: "Load latest task and occurrence" })).toBeVisible();

    savedOccurrence = {
      ...occurrence(),
      occurrenceState: "completed",
      taskVersion: 8,
      transitionEligible: false,
    };
    view.rerenderPanel(savedOccurrence, { ...task(8), status: "cancelled" });

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Undo occurrence" })).not.toBeInTheDocument(),
    );
  });

  it("retains exact recovery choices when the authoritative occurrence becomes unavailable", async () => {
    const user = userEvent.setup();
    mocks.transition.mockImplementationOnce(async () => {
      savedOccurrence = null;
      throw new TypeError("response lost");
    });
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Complete occurrence" }));

    expect(
      await screen.findByText("This occurrence is no longer available under the current series schedule."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry exact occurrence change" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue with latest state" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Continue with latest state" }));
    expect(screen.queryByRole("button", { name: "Retry exact occurrence change" })).not.toBeInTheDocument();
  });

  it("keeps terminal history read-only while its series task is not open", async () => {
    savedOccurrence = { ...occurrence(), occurrenceState: "completed", taskVersion: 5 };
    renderPanel(false, { ...task(5), status: "completed" });

    expect(await screen.findByText("Completed", { exact: true })).toBeVisible();
    expect(
      screen.getByText(
        "This occurrence is read-only because its series task is no longer open. Reopen the task before changing occurrence history.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Undo occurrence" })).not.toBeInTheDocument();
  });

  it("still offers Undo for terminal historical keys while the series task is open", async () => {
    savedOccurrence = {
      ...occurrence(),
      occurrenceState: "skipped",
      taskVersion: 5,
      transitionEligible: false,
    };
    renderPanel(false, task(5));

    expect(await screen.findByText("Skipped", { exact: true })).toBeVisible();
    expect(screen.getByRole("button", { name: "Undo occurrence" })).toBeEnabled();
  });

  it("removes stale occurrence actions when the current series no longer contains the key", async () => {
    savedOccurrence = null;
    renderPanel();

    expect(
      await screen.findByText("This occurrence is no longer available under the current series schedule."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Complete occurrence" })).not.toBeInTheDocument();
  });

  it("shows reopened historical occurrence state without guaranteed-fail transitions", async () => {
    savedOccurrence = { ...occurrence(), transitionEligible: false };
    renderPanel();

    expect(
      await screen.findByText(
        "This preserved occurrence is outside the current series schedule. Its history remains visible, but it cannot be completed or skipped again.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Complete occurrence" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip occurrence" })).not.toBeInTheDocument();
  });

  it("keeps occurrence writes unavailable while details are offline", () => {
    renderPanel(true);

    expect(screen.getByRole("button", { name: "Complete occurrence" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Skip occurrence" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Reconnect to change this occurrence.");
  });
});

function renderPanel(
  disabled = false,
  taskDetail = task(),
  taskFreshness?: Readonly<{
    error: boolean;
    fetching: boolean;
    refetch: () => Promise<unknown>;
  }>,
  selectedOccurrence = occurrence(),
  hourCycle: "h12" | "h23" = "h12",
) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={client}>
      <TaskOccurrencePanel
        disabled={disabled}
        hourCycle={hourCycle}
        occurrence={selectedOccurrence}
        task={taskDetail}
        taskFreshness={taskFreshness}
      />
    </QueryClientProvider>,
  );
  return {
    ...result,
    rerenderPanel(nextOccurrence: TaskOccurrenceDto, nextTask: TaskDetailDto) {
      result.rerender(
        <QueryClientProvider client={client}>
          <TaskOccurrencePanel
            disabled={disabled}
            hourCycle={hourCycle}
            occurrence={nextOccurrence}
            task={nextTask}
          />
        </QueryClientProvider>,
      );
    },
  };
}

function occurrence(): TaskOccurrenceDto {
  return {
    taskId: TASK_ID,
    taskVersion: 4,
    occurrenceKey: "o1.current",
    occurrenceState: "open",
    transitionEligible: true,
    schedule: {
      kind: "timed",
      startAt: "2026-07-20T02:00:00.000Z",
      endAt: "2026-07-20T03:00:00.000Z",
      timezone: "Asia/Singapore",
    },
  };
}

function task(version = 4): TaskDetailDto {
  return {
    id: TASK_ID,
    version,
    createdAt: "2026-07-19T01:00:00.000Z",
    updatedAt: "2026-07-19T01:00:00.000Z",
    deletedAt: null,
    listId: "00000000-0000-4000-8000-000000000020",
    sectionId: null,
    parentTaskId: null,
    title: "Prepare demo",
    descriptionMd: "",
    status: "open",
    priority: "none",
    rank: "a0",
    statusChangedAt: "2026-07-19T01:00:00.000Z",
    checklistItems: [],
    subtasks: [],
    tags: [],
  };
}
