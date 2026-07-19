import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getInbox: vi.fn(),
  listTasks: vi.fn(),
  loadWorkspace: vi.fn(),
}));

vi.mock("@/modules/tasks", () => ({
  getInbox: mocks.getInbox,
  getTasksApplication: () => ({ tasks: { listTasks: mocks.listTasks } }),
}));

vi.mock("@/modules/tasks/presentation", () => ({
  TaskCommandPalette: () => null,
  TaskNavigation: () => null,
  TaskWorkspaceScreen: ({
    destination,
  }: {
    destination: { kind: string; immutableInbox: boolean; initialTasks: { items: unknown[] } };
  }) => (
    <div
      data-testid="task-workspace"
      data-kind={destination.kind}
      data-immutable={destination.immutableInbox}
      data-count={destination.initialTasks.items.length}
    />
  ),
}));

vi.mock("@/modules/identity/presentation", () => ({
  AuthenticatedShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("../_load-workspace", () => ({ loadWorkspace: mocks.loadWorkspace }));

import InboxPage from "./page";

const actor = { userId: "00000000-0000-4000-8000-000000000001" };
const inbox = { id: "00000000-0000-4000-8000-000000000099", name: "Inbox" };

describe("InboxPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadWorkspace.mockResolvedValue({
      identity: { actor },
      preferences: { theme: "system", reducedMotion: false },
    });
    mocks.getInbox.mockResolvedValue(inbox);
    mocks.listTasks.mockResolvedValue({ items: [{ id: "task" }], nextCursor: null });
  });

  it("loads a bounded root-open projection and composes the immutable Inbox", async () => {
    render(await InboxPage());

    expect(mocks.loadWorkspace).toHaveBeenCalledWith("/inbox");
    expect(mocks.listTasks).toHaveBeenCalledWith(actor, {
      listId: inbox.id,
      parentTaskId: null,
      status: "open",
      limit: 50,
    });
    expect(screen.getByTestId("task-workspace")).toHaveAttribute("data-kind", "list");
    expect(screen.getByTestId("task-workspace")).toHaveAttribute("data-immutable", "true");
    expect(screen.getByTestId("task-workspace")).toHaveAttribute("data-count", "1");
  });
});
