import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskDetailDto } from "../application/contracts";
import { TaskApiError } from "./data/task-api-request";
import { taskQueryKeys } from "./data/task-query-keys";
import { clearTaskDrafts, confirmTaskDraftNavigation, hasTaskDraft } from "./task-draft-guard";

const mocks = vi.hoisted(() => ({
  error: null as unknown,
  isError: false,
  isPending: false,
  isSuccess: false,
  mutateAsync: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("./data/use-task-editor-mutations", () => ({
  useUpdateTaskMutation: () => ({
    error: mocks.error,
    isError: mocks.isError,
    isPending: mocks.isPending,
    isSuccess: mocks.isSuccess,
    mutateAsync: mocks.mutateAsync,
    reset: mocks.reset,
  }),
}));

const TASK_ID = "00000000-0000-4000-8000-000000000010";

beforeEach(() => {
  vi.clearAllMocks();
  clearTaskDrafts(TASK_ID);
  mocks.error = null;
  mocks.isError = false;
  mocks.isPending = false;
  mocks.isSuccess = false;
  mocks.mutateAsync.mockResolvedValue(undefined);
});

afterEach(() => {
  clearTaskDrafts(TASK_ID);
  vi.restoreAllMocks();
});

import { TaskTitleEditor } from "./TaskTitleEditor";

describe("TaskTitleEditor conflict recovery", () => {
  it("keeps the user's title draft visible while offering the latest server value", async () => {
    const conflict = new TaskApiError({
      code: "CONFLICT",
      status: 409,
      detail: "Stale task version",
      currentVersion: 2,
    });
    mocks.error = conflict;
    mocks.isError = true;
    mocks.mutateAsync.mockRejectedValue(conflict);
    const client = queryClient();
    client.setQueryData(
      taskQueryKeys.detail(TASK_ID),
      taskDetail({ title: "Latest server title", version: 2 }),
    );
    const user = userEvent.setup();
    renderEditor(client);

    const title = screen.getByLabelText("Task title");
    await user.clear(title);
    await user.type(title, "My preserved title");

    expect(title).toHaveValue("My preserved title");
    expect(screen.getByRole("alert")).toHaveTextContent("This title changed elsewhere");
    expect(screen.getByRole("button", { name: "Use latest" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep editing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Latest server title");
  });

  it("blocks navigation synchronously when blur starts a title write", async () => {
    const request = deferred<void>();
    mocks.mutateAsync.mockReturnValue(request.promise);
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    renderEditor(queryClient());

    const title = screen.getByLabelText("Task title");
    await user.clear(title);
    await user.type(title, "Save before leaving");
    await waitFor(() => expect(hasTaskDraft(TASK_ID, "title")).toBe(true));

    fireEvent.blur(title);

    expect(mocks.mutateAsync).toHaveBeenCalledOnce();
    expect(confirmTaskDraftNavigation(TASK_ID, "title")).toBe(false);
    expect(alert).toHaveBeenCalledWith("Wait for the current task change to finish before leaving.");
    expect(confirm).not.toHaveBeenCalled();

    await act(async () => {
      request.resolve();
      await request.promise;
    });
    await waitFor(() => expect(hasTaskDraft(TASK_ID, "title")).toBe(false));
  });
});

function renderEditor(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <TaskTitleEditor disabled={false} headingId="task-heading" task={taskDetail()} />
    </QueryClientProvider>,
  );
}

function queryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
}

function taskDetail(overrides: Partial<TaskDetailDto> = {}): TaskDetailDto {
  return {
    id: TASK_ID,
    version: 1,
    createdAt: "2026-07-19T01:00:00.000Z",
    updatedAt: "2026-07-19T01:00:00.000Z",
    deletedAt: null,
    listId: "00000000-0000-4000-8000-000000000020",
    sectionId: null,
    parentTaskId: null,
    title: "Server title",
    descriptionMd: "",
    status: "open",
    priority: "none",
    rank: "a0",
    statusChangedAt: "2026-07-19T01:00:00.000Z",
    checklistItems: [],
    subtasks: [],
    tags: [],
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
