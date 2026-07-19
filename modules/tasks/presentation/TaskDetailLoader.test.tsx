import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  data: undefined as { id: string; title: string } | undefined,
  isError: false,
  isPending: false,
  refetch: vi.fn(),
}));

vi.mock("./data/use-task-queries", () => ({
  useTaskDetailQuery: () => ({
    data: mocks.data,
    isError: mocks.isError,
    isPending: mocks.isPending,
    refetch: mocks.refetch,
  }),
}));
vi.mock("./TaskDetailScreen", () => ({
  TaskDetailScreen: ({ task }: { task: { id: string; title: string } }) => (
    <section data-testid="task-details">
      <h1 id={`task-title-${task.id}`} tabIndex={-1}>
        {task.title}
      </h1>
    </section>
  ),
}));

import { TaskDetailLoader } from "./TaskDetailLoader";

const TASK_ID = "0da6e6d9-2cf0-47cc-b869-964b6e91c3c0";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.data = undefined;
  mocks.isError = false;
  mocks.isPending = false;
});

describe("TaskDetailLoader recovery states", () => {
  it("keeps cached task details visible with a retryable stale warning when refresh fails", () => {
    mocks.data = { id: TASK_ID, title: "Prepare the demo" };
    mocks.isError = true;

    renderLoader();

    expect(screen.getByTestId("task-details")).toHaveTextContent("Prepare the demo");
    expect(
      screen.getByText("Showing saved task details. A fresh copy could not be loaded."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Task unavailable" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });

  it("shows the generic unavailable state only when there is no safe task data", () => {
    mocks.isError = true;

    renderLoader();

    expect(screen.getByRole("heading", { name: "Task unavailable" })).toBeInTheDocument();
    expect(screen.queryByTestId("task-details")).not.toBeInTheDocument();
    expect(screen.queryByText(/Showing saved task details/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });
});

function renderLoader() {
  return render(
    <TaskDetailLoader
      inbox={{ id: "52a8bc35-2a7e-44ea-84c1-626383effc70", name: "Inbox" }}
      taskId={TASK_ID}
      returnHref="/inbox"
      onClose={vi.fn()}
    />,
  );
}
