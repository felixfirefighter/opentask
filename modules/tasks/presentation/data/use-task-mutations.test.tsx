import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskListItemDto } from "../../application/contracts";
import { TaskApiError } from "./task-api-request";
import type { TaskPageCache } from "./task-cache";
import { taskQueryKeys } from "./task-query-keys";
import { useCreateTaskMutation, useUpdateTaskMutation } from "./use-task-editor-mutations";

const taskApi = vi.hoisted(() => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
}));

vi.mock("./task-api-client", () => taskApi);

const LIST_ID = "81770f70-1b5b-450a-be9e-012569d256a6";
const TASK_ID = "0da6e6d9-2cf0-47cc-b869-964b6e91c3c0";

beforeEach(() => vi.clearAllMocks());

describe("task mutation rollback", () => {
  it("shows an optimistic quick-add row, then restores the prior page when creation fails", async () => {
    let rejectRequest: ((error: Error) => void) | undefined;
    taskApi.createTask.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectRequest = reject;
      }),
    );
    const client = queryClient();
    client.setQueryData<TaskPageCache>(taskQueryKeys.list(LIST_ID), emptyCache());
    const { result } = renderHook(() => useCreateTaskMutation(), { wrapper: queryWrapper(client) });

    act(() =>
      result.current.mutate({
        resourceId: TASK_ID,
        input: {
          title: "Optimistic task",
          descriptionMd: "",
          priority: "none",
          listId: LIST_ID,
          sectionId: null,
          parentTaskId: null,
          placement: { kind: "start" },
        },
      }),
    );

    await waitFor(() => expect(cachedTasks(client)).toHaveLength(1));
    expect(cachedTasks(client)[0]?.title).toBe("Optimistic task");
    act(() => rejectRequest?.(new Error("offline")));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(cachedTasks(client)).toEqual([]);
  });

  it("rolls a conflicting optimistic title back to the authoritative cached row", async () => {
    taskApi.updateTask.mockRejectedValue(
      new TaskApiError({ code: "CONFLICT", status: 409, detail: "Stale version", currentVersion: 2 }),
    );
    const client = queryClient();
    client.setQueryData<TaskPageCache>(taskQueryKeys.list(LIST_ID), {
      pages: [{ items: [task()], nextCursor: null }],
      pageParams: [undefined],
    });
    const { result } = renderHook(() => useUpdateTaskMutation(), { wrapper: queryWrapper(client) });

    act(() =>
      result.current.mutate({
        taskId: TASK_ID,
        listId: LIST_ID,
        input: { expectedVersion: 1, patch: { title: "My draft" } },
      }),
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(cachedTasks(client)[0]?.title).toBe("Server title");
    expect(result.current.error).toMatchObject({ code: "CONFLICT", currentVersion: 2 });
  });
});

function queryClient() {
  return new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
}

function queryWrapper(client: QueryClient) {
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function emptyCache(): TaskPageCache {
  return { pages: [{ items: [], nextCursor: null }], pageParams: [undefined] };
}

function cachedTasks(client: QueryClient) {
  return (
    client.getQueryData<TaskPageCache>(taskQueryKeys.list(LIST_ID))?.pages.flatMap((page) => page.items) ?? []
  );
}

function task(): TaskListItemDto {
  return {
    id: TASK_ID,
    version: 1,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    deletedAt: null,
    listId: LIST_ID,
    sectionId: null,
    parentTaskId: null,
    title: "Server title",
    descriptionMd: "",
    status: "open",
    priority: "none",
    rank: "a0",
    statusChangedAt: "2026-07-19T00:00:00.000Z",
    tags: [],
  };
}
