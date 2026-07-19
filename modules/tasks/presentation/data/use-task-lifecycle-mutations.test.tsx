import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskDetailDto, TaskDto, TaskListItemDto } from "../../application/contracts";
import { TaskApiError } from "./task-api-request";
import type { TaskPageCache } from "./task-cache";
import { taskQueryKeys } from "./task-query-keys";
import { useDeleteTaskMutation, useTaskStatusMutation } from "./use-task-lifecycle-mutations";

const taskApi = vi.hoisted(() => ({
  deleteTask: vi.fn(),
  getTask: vi.fn(),
  restoreTask: vi.fn(),
  transitionTaskStatus: vi.fn(),
}));
const toastApi = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("./task-api-client", () => taskApi);
vi.mock("sonner", () => ({ toast: toastApi }));

const TASK_ID = "0da6e6d9-2cf0-47cc-b869-964b6e91c3c0";
const SUBTASK_ID = "f5b27df3-a71e-4610-a9a0-f90c184ec5c7";
const LIST_ID = "81770f70-1b5b-450a-be9e-012569d256a6";

beforeEach(() => {
  vi.clearAllMocks();
  taskApi.deleteTask.mockResolvedValue({
    ...task(),
    deletedAt: "2026-07-19T01:00:00.000Z",
    version: 2,
  });
  taskApi.getTask.mockRejectedValue(new Error("not found"));
  taskApi.restoreTask.mockResolvedValue({ ...task(), version: 8 });
});

describe("task delete Undo recovery", () => {
  it("offers Retry after restore failure and retries with the server's latest version", async () => {
    taskApi.restoreTask.mockRejectedValueOnce(
      new TaskApiError({
        code: "CONFLICT",
        status: 409,
        detail: "The task changed elsewhere.",
        currentVersion: 7,
      }),
    );
    const { result } = renderHook(() => useDeleteTaskMutation(), { wrapper: queryWrapper() });

    await act(() => result.current.mutateAsync(task()));
    const undo = toastAction(toastApi.success, "Task deleted");
    expect(undo?.label).toBe("Undo");
    undo?.onClick?.();

    await waitFor(() => expect(taskApi.restoreTask).toHaveBeenCalledWith(TASK_ID, 2));
    await waitFor(() =>
      expect(toastApi.error).toHaveBeenCalledWith("Task could not be restored", expect.anything()),
    );

    const retry = toastAction(toastApi.error, "Task could not be restored");
    expect(retry?.label).toBe("Retry");
    retry?.onClick?.();

    await waitFor(() => expect(taskApi.restoreTask).toHaveBeenNthCalledWith(2, TASK_ID, 7));
    await waitFor(() => expect(toastApi.success).toHaveBeenCalledWith("Task restored"));
  });

  it("reconciles a lost restore response when the authoritative task is already active", async () => {
    taskApi.restoreTask.mockRejectedValueOnce(new TypeError("response lost"));
    taskApi.getTask.mockResolvedValueOnce({ ...task(), version: 3 });
    const { result } = renderHook(() => useDeleteTaskMutation(), { wrapper: queryWrapper() });

    await act(() => result.current.mutateAsync(task()));
    toastAction(toastApi.success, "Task deleted")?.onClick?.();

    await waitFor(() => expect(taskApi.getTask).toHaveBeenCalledWith(TASK_ID));
    await waitFor(() => expect(toastApi.success).toHaveBeenCalledWith("Task restored"));
    expect(taskApi.restoreTask).toHaveBeenCalledTimes(1);
    expect(toastApi.error).not.toHaveBeenCalled();
  });
});

describe("task status cache recovery", () => {
  it("removes a completed root task optimistically and restores its exact list snapshot on rejection", async () => {
    let rejectRequest: ((error: Error) => void) | undefined;
    taskApi.transitionTaskStatus.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectRequest = reject;
      }),
    );
    const client = queryClient();
    client.setQueryData<TaskPageCache>(taskQueryKeys.list(LIST_ID), taskPage([task()]));
    const { result } = renderHook(() => useTaskStatusMutation(), { wrapper: queryWrapper(client) });

    act(() => result.current.mutate({ task: task(), status: "completed" }));

    await waitFor(() => expect(cachedTasks(client, taskQueryKeys.list(LIST_ID))).toEqual([]));
    act(() => rejectRequest?.(new Error("offline")));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(cachedTasks(client, taskQueryKeys.list(LIST_ID))).toEqual([task()]);
  });

  it("merges the authoritative server version into the completed projection", async () => {
    taskApi.transitionTaskStatus.mockResolvedValue({
      ...taskDto(task()),
      status: "completed",
      statusChangedAt: "2026-07-19T02:00:00.000Z",
      version: 4,
    });
    const client = queryClient();
    client.setQueryData<TaskPageCache>(taskQueryKeys.list(LIST_ID), taskPage([task()]));
    client.setQueryData<TaskPageCache>(taskQueryKeys.terminal("completed"), taskPage([]));
    client.setQueryData<TaskDetailDto>(taskQueryKeys.detail(TASK_ID), detail());
    const { result } = renderHook(() => useTaskStatusMutation(), { wrapper: queryWrapper(client) });

    await act(() => result.current.mutateAsync({ task: task(), status: "completed" }));

    expect(cachedTasks(client, taskQueryKeys.list(LIST_ID))).toEqual([]);
    expect(cachedTasks(client, taskQueryKeys.terminal("completed"))[0]).toMatchObject({
      id: TASK_ID,
      status: "completed",
      version: 4,
    });
    expect(client.getQueryData<TaskDetailDto>(taskQueryKeys.detail(TASK_ID))).toMatchObject({
      status: "completed",
      version: 4,
    });
  });

  it("reconciles a lost status-Undo response when the authoritative task is already open", async () => {
    taskApi.transitionTaskStatus.mockResolvedValueOnce({
      ...taskDto(task()),
      status: "completed",
      statusChangedAt: "2026-07-19T02:00:00.000Z",
      version: 2,
    });
    taskApi.getTask.mockResolvedValueOnce({ ...taskDto(task()), version: 3 });
    const client = queryClient();
    client.setQueryData<TaskPageCache>(taskQueryKeys.list(LIST_ID), taskPage([task()]));
    const { result } = renderHook(() => useTaskStatusMutation(), { wrapper: queryWrapper(client) });

    await act(() => result.current.mutateAsync({ task: task(), status: "completed" }));
    taskApi.transitionTaskStatus.mockRejectedValueOnce(new TypeError("response lost"));
    toastAction(toastApi.success, "Task completed")?.onClick?.();

    await waitFor(() => expect(taskApi.getTask).toHaveBeenCalledWith(TASK_ID));
    await waitFor(() => expect(toastApi.success).toHaveBeenCalledWith("Task restored"));
    expect(taskApi.transitionTaskStatus).toHaveBeenCalledTimes(2);
    expect(toastApi.error).not.toHaveBeenCalled();
  });

  it.each([
    { action: "completing", from: "open", to: "completed" },
    { action: "restoring", from: "completed", to: "open" },
  ] as const)(
    "$action a subtask updates its parent detail without inserting the child into the root list",
    async ({ from, to }) => {
      taskApi.transitionTaskStatus.mockResolvedValue({
        ...subtaskDto(from),
        status: to,
        statusChangedAt: "2026-07-19T02:00:00.000Z",
        version: 4,
      });
      const client = queryClient();
      client.setQueryData<TaskPageCache>(taskQueryKeys.list(LIST_ID), taskPage([task()]));
      client.setQueryData<TaskDetailDto>(taskQueryKeys.detail(TASK_ID), detail(from));
      const { result } = renderHook(() => useTaskStatusMutation(), { wrapper: queryWrapper(client) });

      await act(() => result.current.mutateAsync({ task: { ...subtaskDto(from), tags: [] }, status: to }));

      expect(cachedTasks(client, taskQueryKeys.list(LIST_ID)).map(({ id }) => id)).toEqual([TASK_ID]);
      expect(client.getQueryData<TaskDetailDto>(taskQueryKeys.detail(TASK_ID))?.subtasks[0]).toMatchObject({
        id: SUBTASK_ID,
        status: to,
        version: 4,
      });
    },
  );
});

function queryClient() {
  return new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
}

function queryWrapper(client = queryClient()) {
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function cachedTasks(client: QueryClient, queryKey: readonly unknown[]) {
  return client.getQueryData<TaskPageCache>(queryKey)?.pages.flatMap((page) => page.items) ?? [];
}

function taskPage(items: TaskListItemDto[]): TaskPageCache {
  return { pages: [{ items, nextCursor: null }], pageParams: [undefined] };
}

function toastAction(mock: ReturnType<typeof vi.fn>, title: string) {
  const call = mock.mock.calls.find(([message]) => message === title);
  return (call?.[1] as { action?: { label?: string; onClick?: () => void } } | undefined)?.action;
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
    title: "Prepare the demo",
    descriptionMd: "",
    status: "open",
    priority: "none",
    rank: "a0",
    statusChangedAt: "2026-07-19T00:00:00.000Z",
    tags: [],
  };
}

function taskDto(value: TaskListItemDto): TaskDto {
  return {
    id: value.id,
    version: value.version,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    deletedAt: value.deletedAt,
    listId: value.listId,
    sectionId: value.sectionId,
    parentTaskId: value.parentTaskId,
    title: value.title,
    descriptionMd: value.descriptionMd,
    status: value.status,
    priority: value.priority,
    rank: value.rank,
    statusChangedAt: value.statusChangedAt,
  };
}

function subtaskDto(status: "open" | "completed"): TaskDto {
  return {
    ...taskDto(task()),
    id: SUBTASK_ID,
    parentTaskId: TASK_ID,
    title: "Review the mobile layout",
    status,
    rank: "a1",
  };
}

function detail(subtaskStatus: "open" | "completed" = "open"): TaskDetailDto {
  return {
    ...task(),
    checklistItems: [],
    subtasks: [subtaskDto(subtaskStatus)],
  };
}
