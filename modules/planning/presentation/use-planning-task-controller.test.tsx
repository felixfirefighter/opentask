import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PlanningClientError } from "./planning-client-api";
import { usePlanningTaskController, type MutablePlanningTask } from "./use-planning-task-controller";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  setSchedule: vi.fn(),
  transitionOccurrence: vi.fn(),
  transition: vi.fn(),
  updatePriority: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("./planning-client-api", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    setPlanningTaskSchedule: mocks.setSchedule,
    transitionPlanningOccurrence: mocks.transitionOccurrence,
    transitionPlanningTask: mocks.transition,
    updatePlanningTaskPriority: mocks.updatePriority,
  };
});

const TASK_ID = "352493c8-1e29-4dc1-bde7-bffac1c190d2";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updatePriority.mockResolvedValue({ id: TASK_ID, version: 2 });
  mocks.transitionOccurrence.mockResolvedValue({ task: { id: TASK_ID, version: 2 } });
});

describe("usePlanningTaskController", () => {
  it("opens the canonical task detail with its planning return context", () => {
    const client = queryClient();
    renderWithClient(client, <Harness task={task(1)} destination="Do now" returnTo="/calendar?view=week" />);

    fireEvent.click(screen.getByRole("button", { name: "Open task" }));

    expect(mocks.push).toHaveBeenCalledWith(`/tasks/${TASK_ID}?returnTo=%2Fcalendar%3Fview%3Dweek`);
  });

  it("invalidates client projections, refreshes the route, announces the destination, and restores focus", async () => {
    const client = queryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const view = renderWithClient(client, <Harness task={task(1)} destination="Do now" />);

    fireEvent.click(screen.getByRole("button", { name: "Change priority" }));

    await waitFor(() => expect(invalidate).toHaveBeenCalledOnce());
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(screen.getByTestId("announcement")).toHaveTextContent("Refreshing the planning view");

    view.rerender(withClient(client, <Harness task={task(2)} destination="Later" />));

    await waitFor(() => expect(screen.getByRole("link", { name: "Open Alpha" })).toHaveFocus());
    expect(screen.getByTestId("announcement")).toHaveTextContent("Alpha moved to Later");
  });

  it("tracks only the conflicted task and waits for its authoritative version before recovery", async () => {
    mocks.updatePriority.mockRejectedValueOnce(new PlanningClientError("stale", "CONFLICT", 3));
    const client = queryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const view = renderWithClient(client, <Harness task={task(1)} destination="Do now" />);

    fireEvent.click(screen.getByRole("button", { name: "Change priority" }));

    await waitFor(() => expect(screen.getByTestId("condition")).toHaveTextContent("conflict"));
    expect(screen.getByTestId("conflicted-task")).toHaveTextContent(TASK_ID);
    expect(invalidate).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Open Alpha" })).not.toHaveFocus();

    view.rerender(withClient(client, <Harness task={task(3)} destination="Plan" />));

    await waitFor(() => expect(screen.getByRole("link", { name: "Open Alpha" })).toHaveFocus());
    expect(screen.getByTestId("announcement")).toHaveTextContent(
      "Alpha changed elsewhere and is now in Plan",
    );
  });

  it("reports a lost response as unconfirmed until refreshed authoritative props arrive", async () => {
    mocks.updatePriority.mockRejectedValueOnce(new TypeError("response lost"));
    const client = queryClient();
    const initialTask = task(1);
    const view = renderWithClient(client, <Harness task={initialTask} destination="Do now" />);

    fireEvent.click(screen.getByRole("button", { name: "Change priority" }));

    await waitFor(() => expect(screen.getByTestId("condition")).toHaveTextContent("error"));
    expect(screen.getByTestId("announcement")).toHaveTextContent("could not be confirmed");

    view.rerender(withClient(client, <Harness task={task(1)} destination="Do now" />));

    await waitFor(() => expect(screen.getByTestId("condition")).toHaveTextContent("ready"));
    expect(screen.getByTestId("announcement")).toHaveTextContent(
      "Alpha's change could not be confirmed. The latest planning view was loaded.",
    );
  });

  it("reconciles an unconfirmed Calendar change without stealing route-owned focus", async () => {
    mocks.setSchedule.mockRejectedValueOnce(new TypeError("response lost"));
    const client = queryClient();
    const view = renderWithClient(client, <Harness task={task(1)} destination="Do now" />);

    fireEvent.click(screen.getByRole("button", { name: "Move calendar event" }));

    await waitFor(() => expect(screen.getByTestId("condition")).toHaveTextContent("error"));
    const calendarTrigger = screen.getByRole("button", { name: "Calendar schedule trigger" });
    calendarTrigger.focus();

    view.rerender(withClient(client, <Harness task={task(1)} destination="Do now" />));

    await waitFor(() => expect(screen.getByTestId("condition")).toHaveTextContent("ready"));
    expect(screen.getByTestId("announcement")).toHaveTextContent(
      "Alpha's change could not be confirmed. The latest planning view was loaded.",
    );
    expect(calendarTrigger).toHaveFocus();
  });

  it("transitions an occurrence and never substitutes a whole-task status mutation", async () => {
    const client = queryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const view = renderWithClient(client, <Harness task={task(1)} destination="Do now" />);

    fireEvent.click(screen.getByRole("button", { name: "Skip occurrence" }));

    await waitFor(() =>
      expect(mocks.transitionOccurrence).toHaveBeenCalledWith(TASK_ID, 1, "occurrence-key", "skip"),
    );
    expect(mocks.transition).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();

    view.rerender(withClient(client, <Harness task={task(2)} destination="Do now" />));
    await waitFor(() => expect(screen.getByRole("link", { name: "Open Alpha" })).toHaveFocus());
    expect(screen.getByTestId("announcement")).toHaveTextContent("occurrence was updated");
  });

  it("rejects direct mutation callbacks while an application projection is truncated", async () => {
    const client = queryClient();
    renderWithClient(client, <Harness task={task(1)} destination="Do now" mutationsDisabled />);

    fireEvent.click(screen.getByRole("button", { name: "Change priority" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip occurrence" }));
    fireEvent.click(screen.getByRole("button", { name: "Move calendar event" }));

    expect(mocks.updatePriority).not.toHaveBeenCalled();
    expect(mocks.transitionOccurrence).not.toHaveBeenCalled();
    expect(mocks.setSchedule).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByTestId("announcement")).toHaveTextContent(
      "Refresh this incomplete planning view before changing tasks.",
    );
  });
});

function Harness({
  destination,
  mutationsDisabled = false,
  returnTo,
  task,
}: {
  destination: string;
  mutationsDisabled?: boolean;
  returnTo?: string;
  task: MutablePlanningTask;
}) {
  const controller = usePlanningTaskController([task], "Asia/Singapore", {
    authoritativeSource: task,
    destinationLabelForTask: () => destination,
    mutationsDisabled,
    taskReturnTo: returnTo,
  });
  return (
    <section aria-labelledby="source-heading">
      <h2 id="source-heading" tabIndex={-1}>
        Source
      </h2>
      <article
        data-planning-projection-id={`occurrence:${task.id}:occurrence-key`}
        data-planning-task-id={task.id}
      >
        <button type="button" onClick={() => controller.taskActions.onOpenTask?.(task.id)}>
          Open task
        </button>
        <button type="button" onClick={() => controller.taskActions.onPriorityChange?.(task.id, "low")}>
          Change priority
        </button>
        <button
          type="button"
          onClick={() =>
            controller.taskActions.onOccurrenceTransition?.(
              task.id,
              "occurrence-key",
              "skip",
              `occurrence:${task.id}:occurrence-key`,
            )
          }
        >
          Skip occurrence
        </button>
        <button
          type="button"
          onClick={() =>
            void controller.saveCalendarChange({
              taskId: task.id,
              allDay: true,
              start: "2026-07-21",
              end: "2026-07-22",
            })
          }
        >
          Move calendar event
        </button>
        <button type="button">Calendar schedule trigger</button>
        <a data-planning-task-open href={`/tasks/${task.id}`}>
          Open Alpha
        </a>
      </article>
      <span data-testid="condition">{controller.condition.kind}</span>
      <span data-testid="conflicted-task">{controller.conflictedTaskId}</span>
      <span data-testid="announcement">{controller.announcement}</span>
    </section>
  );
}

function task(version: number): MutablePlanningTask {
  return { id: TASK_ID, title: "Alpha", version, schedule: null };
}

function queryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function withClient(client: QueryClient, children: ReactNode) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderWithClient(client: QueryClient, children: ReactNode) {
  return render(withClient(client, children));
}
