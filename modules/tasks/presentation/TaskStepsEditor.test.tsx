import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChecklistItemDto, TaskDetailDto, TaskDto } from "../application/contracts";
import { taskQueryKeys } from "./data/task-query-keys";
import { clearTaskDrafts, hasTaskDraft } from "./task-draft-guard";
import { TaskStepsEditor } from "./TaskStepsEditor";

const taskApi = vi.hoisted(() => ({
  createChecklistItem: vi.fn(),
  createTask: vi.fn(),
  deleteChecklistItem: vi.fn(),
  deleteTask: vi.fn(),
  positionChecklistItem: vi.fn(),
  positionTask: vi.fn(),
  restoreTask: vi.fn(),
  transitionTaskStatus: vi.fn(),
  updateChecklistItem: vi.fn(),
}));

vi.mock("./data/task-api-client", () => taskApi);

const PARENT_ID = "52a8bc35-2a7e-44ea-84c1-626383effc70";
const LIST_ID = "81770f70-1b5b-450a-be9e-012569d256a6";
const SUBTASK_A_ID = "0da6e6d9-2cf0-47cc-b869-964b6e91c3c0";
const SUBTASK_B_ID = "f1c528b7-cfc6-4fe6-b5c2-9b536434a6fd";
const CHECK_A_ID = "667aaef1-f0bc-4b5d-bff2-ed6c33ad99b5";
const CHECK_B_ID = "7b2b79d3-ad4f-4c5a-a7b5-f0ce6674c6c1";
const SUBTASK_CREATE_ID = "e1b53513-6f70-4d75-bd4c-fd4523e39d1a";
const SUBTASK_CHANGED_ID = "729028a4-4db1-48ca-895d-48a502f8ea8b";
const CHECK_CREATE_ID = "d3b87c25-e7c1-4422-9158-5c5d573b0463";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  clearTaskDrafts(PARENT_ID);
});

describe("TaskStepsEditor reorder parity", () => {
  it("supports keyboard pickup/cancel and menu-based subtask and checklist moves", async () => {
    const task = detail();
    taskApi.positionTask.mockResolvedValue({ ...task.subtasks[1], version: 2, rank: "Zz" });
    taskApi.positionChecklistItem.mockResolvedValue({
      ...task.checklistItems[0],
      version: 5,
      rank: "Zz",
    });
    const user = userEvent.setup();
    renderSteps(task);

    const handle = screen.getByRole("button", { name: "Reorder First subtask" });
    expect(document.getElementById(handle.getAttribute("aria-describedby")!)).toHaveTextContent(
      "press Space to pick up",
    );
    handle.focus();
    await user.keyboard("[Space]");
    await waitFor(() => expect(handle).toHaveAttribute("aria-pressed", "true"));
    expect(await screen.findByText("First subtask picked up at position 1 of 2.")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    await user.keyboard("[Escape]");
    await waitFor(() => expect(handle).not.toHaveAttribute("aria-pressed", "true"));
    expect(
      await screen.findByText("First subtask reorder cancelled and returned to position 1 of 2."),
    ).toHaveAttribute("aria-live", "polite");

    screen.getByRole("button", { name: "Open actions for Second subtask" }).focus();
    await user.keyboard("[Enter]");
    const moveSubtask = await screen.findByRole("menuitem", {
      name: "Move Second subtask earlier",
    });
    expect(moveSubtask).toHaveFocus();
    await user.keyboard("[Enter]");
    await waitFor(() =>
      expect(taskApi.positionTask).toHaveBeenCalledWith(SUBTASK_B_ID, {
        expectedVersion: 1,
        placement: { kind: "before", anchorId: SUBTASK_A_ID },
      }),
    );
    expect(await screen.findByText("Second subtask moved to position 1.")).toBeInTheDocument();

    screen.getByRole("button", { name: "Open actions for First check" }).focus();
    await user.keyboard("[Enter]");
    const moveChecklist = await screen.findByRole("menuitem", { name: "Move First check later" });
    expect(moveChecklist).toHaveFocus();
    await user.keyboard("[Enter]");
    await waitFor(() =>
      expect(taskApi.positionChecklistItem).toHaveBeenCalledWith(PARENT_ID, CHECK_A_ID, {
        expectedVersion: 4,
        placement: { kind: "after", anchorId: CHECK_B_ID },
      }),
    );
    expect(await screen.findByText("First check moved to position 2.")).toBeInTheDocument();
  });

  it("disables reorder writes offline and preserves create drafts for navigation guards", async () => {
    const user = userEvent.setup();
    const offline = renderSteps(detail(), true);

    expect(screen.getByRole("button", { name: "Reorder First subtask" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open actions for First check" })).toBeDisabled();
    expect(screen.getByLabelText("Add subtask")).toBeDisabled();
    expect(screen.getByLabelText("Add checklist item")).toBeDisabled();

    offline.unmount();
    renderSteps(detail());
    await user.type(screen.getByLabelText("Add subtask"), "Draft child");
    await user.type(screen.getByLabelText("Add checklist item"), "Draft check");
    await waitFor(() => expect(hasTaskDraft(PARENT_ID, "subtask-create")).toBe(true));
    expect(hasTaskDraft(PARENT_ID, "checklist-create")).toBe(true);
  });

  it("confirms checklist removal with safe focus and keeps the dialog open on failure", async () => {
    taskApi.deleteChecklistItem.mockRejectedValue(new Error("conflict"));
    const user = userEvent.setup();
    renderSteps(detail());

    await user.click(screen.getByRole("button", { name: "Open actions for First check" }));
    await user.click(await screen.findByRole("menuitem", { name: "Remove First check" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Remove checklist item?" });
    expect(screen.getByRole("button", { name: "Keep item" })).toHaveFocus();
    expect(taskApi.deleteChecklistItem).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remove item" }));

    await waitFor(() => expect(taskApi.deleteChecklistItem).toHaveBeenCalled());
    expect(dialog).toBeInTheDocument();
    expect(
      screen.getByText("The checklist item was not removed. Review the task and try again."),
    ).toBeInTheDocument();
  });

  it("labels cancelled subtasks without presenting them as completed", () => {
    const parent = detail();
    parent.subtasks[0] = { ...parent.subtasks[0]!, status: "cancelled" };
    renderSteps(parent);

    expect(screen.getByRole("link", { name: "First subtask Cancelled" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore First subtask" })).toBeInTheDocument();
  });

  it("retains create resource IDs when an ambiguous failure is retried unchanged", async () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce(SUBTASK_CREATE_ID)
      .mockReturnValueOnce(SUBTASK_CHANGED_ID)
      .mockReturnValueOnce(CHECK_CREATE_ID);
    taskApi.createTask.mockRejectedValue(new Error("connection lost"));
    taskApi.createChecklistItem.mockRejectedValue(new Error("connection lost"));
    const user = userEvent.setup();
    renderSteps(detail());

    const subtaskInput = screen.getByLabelText("Add subtask");
    const subtaskForm = subtaskInput.closest("form")!;
    await user.type(subtaskInput, "Retry child");
    await user.click(within(subtaskForm).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(taskApi.createTask).toHaveBeenCalledTimes(1));
    await user.click(within(subtaskForm).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(taskApi.createTask).toHaveBeenCalledTimes(2));
    expect(taskApi.createTask.mock.calls[0]?.[0]).toBe(SUBTASK_CREATE_ID);
    expect(taskApi.createTask.mock.calls[1]?.[0]).toBe(SUBTASK_CREATE_ID);
    await user.clear(subtaskInput);
    await user.type(subtaskInput, "Changed child");
    await user.click(within(subtaskForm).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(taskApi.createTask).toHaveBeenCalledTimes(3));
    expect(taskApi.createTask.mock.calls[2]?.[0]).toBe(SUBTASK_CHANGED_ID);

    const checklistInput = screen.getByLabelText("Add checklist item");
    const checklistForm = checklistInput.closest("form")!;
    await user.type(checklistInput, "Retry check");
    await user.click(within(checklistForm).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(taskApi.createChecklistItem).toHaveBeenCalledTimes(1));
    await user.click(within(checklistForm).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(taskApi.createChecklistItem).toHaveBeenCalledTimes(2));
    expect(taskApi.createChecklistItem.mock.calls[0]?.[1]).toBe(CHECK_CREATE_ID);
    expect(taskApi.createChecklistItem.mock.calls[1]?.[1]).toBe(CHECK_CREATE_ID);
  });
});

function renderSteps(task: TaskDetailDto, disabled = false) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  client.setQueryData(taskQueryKeys.detail(task.id), task);
  return render(<TaskStepsEditor disabled={disabled} task={task} />, {
    wrapper: function QueryWrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    },
  });
}

function detail(): TaskDetailDto {
  return {
    ...task(PARENT_ID, null, "Parent", "a0"),
    checklistItems: [
      checklist(CHECK_A_ID, "First check", "a0", 4),
      checklist(CHECK_B_ID, "Second check", "a1", 7),
    ],
    tags: [],
    subtasks: [
      task(SUBTASK_A_ID, PARENT_ID, "First subtask", "a0"),
      task(SUBTASK_B_ID, PARENT_ID, "Second subtask", "a1"),
    ],
  };
}

function task(id: string, parentTaskId: string | null, title: string, rank: string): TaskDto {
  return {
    id,
    version: 1,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    deletedAt: null,
    listId: LIST_ID,
    sectionId: null,
    parentTaskId,
    title,
    descriptionMd: "",
    status: "open",
    priority: "none",
    rank,
    statusChangedAt: "2026-07-19T00:00:00.000Z",
  };
}

function checklist(id: string, title: string, rank: string, version: number): ChecklistItemDto {
  return {
    id,
    taskId: PARENT_ID,
    version,
    title,
    isCompleted: false,
    rank,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
  };
}
