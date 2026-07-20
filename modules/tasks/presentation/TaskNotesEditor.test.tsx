import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskDetailDto } from "../application/contracts";
import { taskQueryKeys } from "./data/task-query-keys";
import { clearTaskDrafts, confirmTaskDraftNavigation, hasTaskDraft } from "./task-draft-guard";

const mocks = vi.hoisted(() => ({
  error: null as unknown,
  isError: false,
  isPending: false,
  mutateAsync: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("./data/use-task-editor-mutations", () => ({
  useUpdateTaskMutation: () => ({
    error: mocks.error,
    isError: mocks.isError,
    isPending: mocks.isPending,
    mutateAsync: mocks.mutateAsync,
    reset: mocks.reset,
  }),
}));

import { TaskNotesEditor } from "./TaskNotesEditor";

const TASK_ID = "00000000-0000-4000-8000-000000000010";

beforeEach(() => {
  vi.clearAllMocks();
  clearTaskDrafts(TASK_ID);
  mocks.error = null;
  mocks.isError = false;
  mocks.isPending = false;
  mocks.mutateAsync.mockResolvedValue(undefined);
});

afterEach(() => {
  clearTaskDrafts(TASK_ID);
  vi.restoreAllMocks();
});

describe("TaskNotesEditor", () => {
  it("renders Markdown semantics without executing or exposing raw HTML", () => {
    const { container } = render(
      <QueryClientProvider client={queryClient()}>
        <TaskNotesEditor
          disabled={false}
          task={taskDetail({
            descriptionMd:
              "# Release notes\n\n- Keep the list semantic\n\n<script>alert('unsafe')</script>\n\n[Unsafe link](javascript:alert('unsafe'))",
          })}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: "Release notes" })).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("Keep the list semantic");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    const unsafeLink = screen.getByText("Unsafe link").closest("a");
    expect(unsafeLink).not.toBeNull();
    expect(unsafeLink?.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
  });

  it("blocks navigation while a notes save is in flight", async () => {
    const request = deferred<void>();
    mocks.mutateAsync.mockReturnValue(request.promise);
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient()}>
        <TaskNotesEditor disabled={false} task={taskDetail()} />
      </QueryClientProvider>,
    );

    await user.type(screen.getByLabelText("Markdown description"), "Keep this draft");
    await waitFor(() => expect(hasTaskDraft(TASK_ID, "notes")).toBe(true));
    await user.click(screen.getByRole("button", { name: "Save notes" }));

    expect(mocks.mutateAsync).toHaveBeenCalledOnce();
    expect(confirmTaskDraftNavigation(TASK_ID, "notes")).toBe(false);
    expect(alert).toHaveBeenCalledWith("Wait for the current task change to finish before leaving.");
    expect(confirm).not.toHaveBeenCalled();

    await act(async () => {
      request.resolve();
      await request.promise;
    });
    await waitFor(() => expect(hasTaskDraft(TASK_ID, "notes")).toBe(false));
  });

  it("reconciles accepted notes after a lost response without writing them twice", async () => {
    const client = queryClient();
    const user = userEvent.setup();
    const view = render(
      <QueryClientProvider client={client}>
        <TaskNotesEditor disabled={false} task={taskDetail()} />
      </QueryClientProvider>,
    );
    const notes = screen.getByLabelText("Markdown description");
    await user.type(notes, "Accepted **Markdown** after response loss");

    mocks.error = new TypeError("Failed to fetch");
    mocks.isError = true;
    client.setQueryData(
      taskQueryKeys.detail(TASK_ID),
      taskDetail({ descriptionMd: "Accepted **Markdown** after response loss", version: 2 }),
    );
    view.rerender(
      <QueryClientProvider client={client}>
        <TaskNotesEditor disabled={false} task={taskDetail()} />
      </QueryClientProvider>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("notes update is unconfirmed");
    expect(alert).not.toHaveTextContent("Notes were not saved");
    expect(notes).toHaveValue("Accepted **Markdown** after response loss");
    expect(screen.getByRole("button", { name: "Save notes" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.reset).toHaveBeenCalledOnce();
  });
});

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
    title: "Prepare demo",
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
