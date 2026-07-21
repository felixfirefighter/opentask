import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getInbox: vi.fn(),
  listTerminalTasks: vi.fn(),
  loadWorkspace: vi.fn(),
}));

vi.mock("@/modules/tasks", () => ({
  getInbox: mocks.getInbox,
  getTasksApplication: () => ({ tasks: { listTerminalTasks: mocks.listTerminalTasks } }),
}));

vi.mock("@/modules/tasks/presentation", () => ({
  TaskCommandPalette: () => null,
  TaskNavigation: () => null,
  TaskWorkspaceScreen: ({
    destination,
  }: {
    destination: {
      kind: string;
      initialCompleted: { items: unknown[] };
      initialCancelled: { items: unknown[] };
    };
  }) => (
    <div
      data-testid="task-workspace"
      data-kind={destination.kind}
      data-completed={destination.initialCompleted.items.length}
      data-cancelled={destination.initialCancelled.items.length}
    />
  ),
}));

vi.mock("@/modules/identity/presentation", () => ({
  AuthenticatedShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("../_load-workspace", () => ({ loadWorkspace: mocks.loadWorkspace }));
vi.mock("../_components/TaskReminderComposition", () => ({
  TaskReminderComposition: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import CompletedPage from "./page";

const actor = { userId: "00000000-0000-4000-8000-000000000001" };

describe("CompletedPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadWorkspace.mockResolvedValue({
      identity: { actor },
      preferences: { theme: "system", reducedMotion: false },
    });
    mocks.getInbox.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000099", name: "Inbox" });
  });

  it("loads bounded completed and cancelled pages before composing the workspace", async () => {
    mocks.listTerminalTasks
      .mockResolvedValueOnce({ items: [{ id: "completed" }], nextCursor: null })
      .mockResolvedValueOnce({ items: [{ id: "cancelled" }], nextCursor: null });

    render(await CompletedPage());

    expect(mocks.loadWorkspace).toHaveBeenCalledWith("/completed");
    expect(mocks.listTerminalTasks).toHaveBeenNthCalledWith(1, actor, {
      status: "completed",
      limit: 50,
    });
    expect(mocks.listTerminalTasks).toHaveBeenNthCalledWith(2, actor, {
      status: "cancelled",
      limit: 50,
    });
    expect(screen.getByTestId("task-workspace")).toHaveAttribute("data-kind", "terminal");
    expect(screen.getByTestId("task-workspace")).toHaveAttribute("data-completed", "1");
    expect(screen.getByTestId("task-workspace")).toHaveAttribute("data-cancelled", "1");
  });
});
