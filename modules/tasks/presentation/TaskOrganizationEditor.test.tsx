import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskDetailDto } from "../application/contracts";
import { taskQueryKeys } from "./data/task-query-keys";

const mutation = vi.hoisted(() => ({
  error: null as unknown,
  isError: false,
  isPending: false,
  isSuccess: false,
  mutate: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("./data/use-task-editor-mutations", () => ({
  useUpdateTaskMutation: () => mutation,
}));

vi.mock("./data/use-organizer-queries", () => ({
  useRegularListsQuery: () => ({ lists: [] }),
  useSectionsQuery: () => ({ isPending: false, sections: [] }),
}));

import { TaskOrganizationEditor } from "./TaskOrganizationEditor";

const TASK_ID = "00000000-0000-4000-8000-000000000010";
const LIST_ID = "00000000-0000-4000-8000-000000000020";

beforeEach(() => {
  vi.clearAllMocks();
  mutation.error = null;
  mutation.isError = false;
  mutation.isPending = false;
  mutation.isSuccess = false;
});

describe("TaskOrganizationEditor write recovery", () => {
  it("preserves an unconfirmed priority draft and retries against authoritative task data", async () => {
    mutation.error = new TypeError("Failed to fetch");
    mutation.isError = true;
    const client = queryClient();
    client.setQueryData(taskQueryKeys.detail(TASK_ID), taskDetail({ priority: "high", version: 2 }));
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <TaskOrganizationEditor disabled={false} inbox={{ id: LIST_ID, name: "Inbox" }} task={taskDetail()} />
      </QueryClientProvider>,
    );

    await user.selectOptions(screen.getByLabelText("Priority"), "medium");

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("priority update is unconfirmed");
    expect(alert).not.toHaveTextContent("Priority was not saved");
    expect(alert).toHaveTextContent("Your choice: Medium. Latest saved priority: High.");
    expect(screen.getByLabelText("Priority")).toHaveValue("medium");

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(mutation.mutate).toHaveBeenCalledOnce();
    expect(mutation.mutate.mock.calls[0]?.[0]).toEqual({
      taskId: TASK_ID,
      listId: LIST_ID,
      input: { expectedVersion: 2, patch: { priority: "medium" } },
    });
    expect(mutation.mutate.mock.calls[0]?.[1]).toMatchObject({ onSuccess: expect.anything() });
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
    listId: LIST_ID,
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
