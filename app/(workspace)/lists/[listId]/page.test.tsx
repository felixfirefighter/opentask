import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationError } from "@/shared/http/application-error";

const mocks = vi.hoisted(() => ({
  getInbox: vi.fn(),
  getRegularList: vi.fn(),
  listTasks: vi.fn(),
  loadWorkspace: vi.fn(),
}));

vi.mock("@/modules/tasks", () => ({
  getInbox: mocks.getInbox,
  getTasksApplication: () => ({
    lists: { getRegularList: mocks.getRegularList },
    tasks: { listTasks: mocks.listTasks },
  }),
}));

vi.mock("@/modules/tasks/presentation", () => ({
  TaskCommandPalette: () => null,
  TaskNavigation: () => null,
  TaskWorkspaceScreen: ({ destination }: { destination: { kind: string; list: { name: string } } }) => (
    <div data-testid="task-workspace" data-kind={destination.kind}>
      {destination.list.name}
    </div>
  ),
}));

vi.mock("@/modules/identity/presentation", () => ({
  AuthenticatedShell: ({ children, destinationTitle }: { children: ReactNode; destinationTitle: string }) => (
    <div data-destination-title={destinationTitle}>{children}</div>
  ),
}));

vi.mock("../../_load-workspace", () => ({ loadWorkspace: mocks.loadWorkspace }));
vi.mock("../../_components/TaskReminderComposition", () => ({
  TaskReminderComposition: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import RegularListPage from "./page";

const actor = { userId: "00000000-0000-4000-8000-000000000001" };
const listId = "00000000-0000-4000-8000-000000000010";

describe("RegularListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadWorkspace.mockResolvedValue({
      identity: { actor },
      preferences: { theme: "system", reducedMotion: false },
    });
    mocks.getInbox.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000099", name: "Inbox" });
    mocks.listTasks.mockResolvedValue({ items: [], nextCursor: null });
  });

  it("loads the actor-scoped list and composes the task workspace", async () => {
    mocks.getRegularList.mockResolvedValue({ id: listId, name: "Launch" });

    render(await RegularListPage({ params: Promise.resolve({ listId }) }));

    expect(mocks.loadWorkspace).toHaveBeenCalledWith(`/lists/${listId}`);
    expect(mocks.getRegularList).toHaveBeenCalledWith(actor, listId);
    expect(mocks.listTasks).toHaveBeenCalledWith(actor, {
      listId,
      parentTaskId: null,
      status: "open",
      limit: 50,
    });
    expect(screen.getByTestId("task-workspace")).toHaveAttribute("data-kind", "list");
    expect(screen.getByText("Launch").parentElement).toHaveAttribute("data-destination-title", "Launch");
  });

  it("uses the same unavailable state for a missing or foreign list", async () => {
    mocks.getRegularList.mockRejectedValue(
      new ApplicationError("NOT_FOUND", "The requested resource was not found."),
    );

    render(await RegularListPage({ params: Promise.resolve({ listId }) }));

    expect(screen.getByRole("heading", { name: "List unavailable" })).toBeInTheDocument();
    expect(screen.queryByTestId("task-workspace")).not.toBeInTheDocument();
    expect(screen.getByText(/could not be found or you may not have access/i)).toBeInTheDocument();
  });
});
