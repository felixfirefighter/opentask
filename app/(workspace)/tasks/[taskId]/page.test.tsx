import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "@/shared/http/application-error";

const mocks = vi.hoisted(() => ({
  getInbox: vi.fn(),
  getTask: vi.fn(),
  loadWorkspace: vi.fn(),
}));

vi.mock("@/modules/tasks", () => ({
  getInbox: mocks.getInbox,
  getTasksApplication: () => ({ tasks: { getTask: mocks.getTask } }),
}));

vi.mock("@/modules/tasks/presentation", () => ({
  TaskCommandPalette: () => null,
  TaskNavigation: () => null,
  TaskDetailScreen: ({ mode, task }: { mode: string; task: { title: string } }) => (
    <div data-testid="task-detail" data-mode={mode}>
      {task.title}
    </div>
  ),
}));

vi.mock("@/modules/identity/presentation", () => ({
  AuthenticatedShell: ({ children, mobileNavigation }: { children: ReactNode; mobileNavigation: null }) => (
    <div data-mobile-navigation={mobileNavigation === null ? "hidden" : "visible"}>{children}</div>
  ),
}));

vi.mock("../../_load-workspace", () => ({ loadWorkspace: mocks.loadWorkspace }));

import TaskDetailPage from "./page";

const actor = { userId: "00000000-0000-4000-8000-000000000001" };
const taskId = "00000000-0000-4000-8000-000000000020";

describe("TaskDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadWorkspace.mockResolvedValue({
      identity: { actor },
      preferences: { theme: "system", reducedMotion: false },
    });
    mocks.getInbox.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000099", name: "Inbox" });
  });

  it("loads the actor-scoped task and composes the full-page detail", async () => {
    mocks.getTask.mockResolvedValue({ id: taskId, title: "Prepare demo" });

    render(await TaskDetailPage({ params: Promise.resolve({ taskId }) }));

    expect(mocks.loadWorkspace).toHaveBeenCalledWith(`/tasks/${taskId}`);
    expect(mocks.getTask).toHaveBeenCalledWith(actor, taskId);
    expect(screen.getByTestId("task-detail")).toHaveAttribute("data-mode", "page");
    expect(screen.getByText("Prepare demo").parentElement).toHaveAttribute(
      "data-mobile-navigation",
      "hidden",
    );
  });

  it("uses the same unavailable state for a missing or foreign task", async () => {
    mocks.getTask.mockRejectedValue(
      new ApplicationError("NOT_FOUND", "The requested resource was not found."),
    );

    render(await TaskDetailPage({ params: Promise.resolve({ taskId }) }));

    expect(screen.getByRole("heading", { name: "Task unavailable" })).toBeInTheDocument();
    expect(screen.queryByTestId("task-detail")).not.toBeInTheDocument();
    expect(screen.getByText(/could not be found or you may not have access/i)).toBeInTheDocument();
  });
});
