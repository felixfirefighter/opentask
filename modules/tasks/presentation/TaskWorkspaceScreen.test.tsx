import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskListItemDto } from "../application/contracts";

import { TaskEmpty } from "./TaskWorkspaceContent";
import { TaskWorkspaceScreen } from "./TaskWorkspaceScreen";

const organizerQueries = vi.hoisted(() => ({ useSectionsQuery: vi.fn() }));
const taskQueries = vi.hoisted(() => ({
  useTaskListQuery: vi.fn(),
  useTerminalTaskQuery: vi.fn(),
}));

vi.mock("./data/use-organizer-queries", () => organizerQueries);
vi.mock("./data/use-task-queries", () => taskQueries);
vi.mock("./TaskQuickAdd", () => ({
  TaskQuickAdd: () => <div data-testid="quick-add" />,
}));
vi.mock("./TaskList", () => ({
  TaskList: ({ reorderable, tasks }: Readonly<{ reorderable: boolean; tasks: TaskListItemDto[] }>) => (
    <ul data-reorderable={String(reorderable)}>
      {tasks.map((task) => (
        <li key={task.id}>{task.title}</li>
      ))}
    </ul>
  ),
}));
vi.mock("./TaskSectionControls", () => ({
  CreateSectionControl: () => <button type="button">Add section</button>,
  SectionActions: () => null,
}));
vi.mock("./TaskInspector", () => ({ TaskInspector: () => null }));
vi.mock("@/shared/presentation", () => ({ useOnlineStatus: () => true }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/lists/81770f70-1b5b-450a-be9e-012569d256a6",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const LIST_ID = "81770f70-1b5b-450a-be9e-012569d256a6";

beforeEach(() => {
  vi.clearAllMocks();
  taskQueries.useTaskListQuery.mockReturnValue(taskQueryState());
  organizerQueries.useSectionsQuery.mockReturnValue(sectionQueryState());
});

describe("TaskWorkspaceScreen partial section data", () => {
  it("renders successful task rows in a non-reorderable fallback and retries failed metadata", async () => {
    const refetchTasks = vi.fn();
    const refetchSections = vi.fn();
    taskQueries.useTaskListQuery.mockReturnValue(taskQueryState({ refetch: refetchTasks }));
    organizerQueries.useSectionsQuery.mockReturnValue(
      sectionQueryState({ isError: true, refetch: refetchSections }),
    );

    renderWorkspace();

    expect(screen.getByRole("heading", { name: "Section grouping unavailable" })).toBeInTheDocument();
    expect(screen.getByText("Prepare demo")).toBeInTheDocument();
    expect(screen.getByRole("list")).toHaveAttribute("data-reorderable", "false");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Sections could not be refreshed. Tasks are shown without section grouping.",
    );

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetchTasks).toHaveBeenCalledOnce();
    expect(refetchSections).toHaveBeenCalledOnce();
  });

  it("shows available task rows instead of a skeleton while section metadata has no cache", () => {
    organizerQueries.useSectionsQuery.mockReturnValue(sectionQueryState({ isPending: true }));

    renderWorkspace();

    expect(screen.getByText("Prepare demo")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Section grouping unavailable" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Sections are still loading. Tasks are temporarily shown without section grouping.",
    );
    expect(screen.queryByText("Loading tasks…")).not.toBeInTheDocument();
  });
});

describe("TaskEmpty", () => {
  it("explains and disables task creation while offline", () => {
    render(<TaskEmpty title="Inbox is empty" disabled />);

    expect(screen.getByText("Reconnect to add a task.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a task" })).toBeDisabled();
  });
});

function renderWorkspace() {
  return render(
    <TaskWorkspaceScreen destination={{ kind: "list", list: { id: LIST_ID, name: "Launch" } }} />,
  );
}

function taskQueryState(overrides: Record<string, unknown> = {}) {
  return {
    tasks: [task()],
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  };
}

function sectionQueryState(overrides: Record<string, unknown> = {}) {
  return {
    sections: [],
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  };
}

function task(): TaskListItemDto {
  return {
    id: "0da6e6d9-2cf0-47cc-b869-964b6e91c3c0",
    listId: LIST_ID,
    sectionId: "5fd78e58-6b11-42a4-bd68-324f6c408166",
    parentTaskId: null,
    title: "Prepare demo",
    descriptionMd: "",
    status: "open",
    priority: "high",
    rank: "a",
    statusChangedAt: "2026-07-19T00:00:00.000Z",
    tags: [],
    version: 1,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    deletedAt: null,
  };
}
