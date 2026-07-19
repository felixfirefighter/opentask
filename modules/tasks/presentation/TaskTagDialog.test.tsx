import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TagDto, TaskDetailDto } from "../application/contracts";
import { clearTaskDrafts, confirmTaskDraftNavigation, hasTaskDraft } from "./task-draft-guard";

const mocks = vi.hoisted(() => ({
  createMutateAsync: vi.fn(),
  createReset: vi.fn(),
  deleteMutate: vi.fn(),
  deleteReset: vi.fn(),
  replaceMutateAsync: vi.fn(),
  replaceReset: vi.fn(),
  updateMutate: vi.fn(),
  updatePending: false,
  updateReset: vi.fn(),
}));

vi.mock("./data/use-organizer-queries", () => ({
  useTagsQuery: () => ({
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    isPending: false,
    isSuccess: true,
    refetch: vi.fn(),
    tags: [tag()],
  }),
}));

vi.mock("./data/use-tag-mutations", () => ({
  useCreateTagMutation: () => ({
    error: null,
    isPending: false,
    mutateAsync: mocks.createMutateAsync,
    reset: mocks.createReset,
  }),
  useDeleteTagMutation: () => ({
    error: null,
    isPending: false,
    mutate: mocks.deleteMutate,
    reset: mocks.deleteReset,
  }),
  useUpdateTagMutation: () => ({
    error: null,
    isPending: mocks.updatePending,
    mutate: mocks.updateMutate,
    reset: mocks.updateReset,
  }),
}));

vi.mock("./data/use-task-organization-mutations", () => ({
  useReplaceTaskTagsMutation: () => ({
    error: null,
    isError: false,
    isPending: false,
    mutateAsync: mocks.replaceMutateAsync,
    reset: mocks.replaceReset,
  }),
}));

vi.mock("./use-task-conflict-recovery", () => ({
  useTaskConflictRecovery: (task: TaskDetailDto) => ({
    conflict: false,
    latestReady: false,
    latestTask: task,
    loadingLatest: false,
    refetchLatest: vi.fn(),
  }),
}));

import { TaskTagDialog } from "./TaskTagDialog";

const TASK_ID = "00000000-0000-4000-8000-000000000010";
const TAG_ID = "00000000-0000-4000-8000-000000000030";

beforeEach(() => {
  vi.clearAllMocks();
  clearTaskDrafts(TASK_ID);
  mocks.updatePending = false;
  mocks.createMutateAsync.mockResolvedValue(tag());
  mocks.replaceMutateAsync.mockResolvedValue(undefined);
});

afterEach(() => {
  clearTaskDrafts(TASK_ID);
  vi.restoreAllMocks();
});

describe("TaskTagDialog tag-library drafts", () => {
  it("guards a changed tag rename and prevents Save tags from discarding it", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<TaskTagDialog disabled={false} onOpenChange={onOpenChange} open task={taskDetail()} />);

    await user.click(screen.getByRole("button", { name: "Rename Launch" }));
    const name = screen.getByLabelText("Tag name");
    await user.clear(name);
    await user.type(name, "Launch ready");

    await waitFor(() => expect(hasTaskDraft(TASK_ID, "tags")).toBe(true));
    expect(screen.getByRole("button", { name: "Save tags" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Close tags dialog" }));

    expect(confirm).toHaveBeenCalledWith(
      "Discard unsaved task changes? Your latest saved version will remain available.",
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(name).toHaveValue("Launch ready");

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Close tags dialog" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("tracks rename writes as pending and hard-blocks dialog close without a discard prompt", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    const currentTask = taskDetail();
    const view = render(
      <TaskTagDialog disabled={false} onOpenChange={onOpenChange} open task={currentTask} />,
    );

    await user.click(screen.getByRole("button", { name: "Rename Launch" }));
    mocks.updatePending = true;
    view.rerender(<TaskTagDialog disabled={false} onOpenChange={onOpenChange} open task={currentTask} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled());
    await waitFor(() => expect(hasTaskDraft(TASK_ID, "tags")).toBe(true));
    expect(screen.getByRole("button", { name: "Close tags dialog" })).toBeDisabled();
    expect(confirmTaskDraftNavigation(TASK_ID, "tags")).toBe(false);
    expect(alert).toHaveBeenCalledWith("Wait for the current task change to finish before leaving.");
    expect(confirm).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

function tag(): TagDto {
  return {
    id: TAG_ID,
    name: "Launch",
    colorToken: "coral",
    version: 1,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    deletedAt: null,
  };
}

function taskDetail(): TaskDetailDto {
  return {
    id: TASK_ID,
    version: 1,
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
    tags: [tag()],
  };
}
