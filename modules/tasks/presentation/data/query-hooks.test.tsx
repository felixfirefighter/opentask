import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  FolderPage,
  TaskDetailDto,
  TaskListItemDto,
  TaskOccurrenceDto,
  TaskPage,
  TaskRecurrenceDto,
} from "../../application/contracts";

import { useFoldersQuery } from "./use-organizer-queries";
import {
  taskOccurrenceQueryKey,
  useTaskOccurrenceMutation,
  useTaskOccurrenceQuery,
} from "./use-task-occurrence";
import { useTaskDetailQuery, useTaskListQuery, useTaskSearchQuery } from "./use-task-queries";
import { taskQueryKeys } from "./task-query-keys";
import { taskRecurrenceQueryKey } from "./use-task-recurrence";

const taskApi = vi.hoisted(() => ({
  getTask: vi.fn(),
  listTasks: vi.fn(),
  listTerminalTasks: vi.fn(),
  searchTasks: vi.fn(),
}));
const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
const occurrenceApi = vi.hoisted(() => ({
  getTaskOccurrence: vi.fn(),
  transitionTaskOccurrence: vi.fn(),
}));
const organizerApi = vi.hoisted(() => ({
  listFolders: vi.fn(),
  listRegularLists: vi.fn(),
  listSections: vi.fn(),
}));
const tagApi = vi.hoisted(() => ({ listTags: vi.fn() }));

vi.mock("./task-api-client", () => taskApi);
vi.mock("./task-occurrence-api-client", () => occurrenceApi);
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("./organizer-api-client", () => organizerApi);
vi.mock("./tag-api-client", () => tagApi);

const TASK_ID = "0da6e6d9-2cf0-47cc-b869-964b6e91c3c0";
const LIST_ID = "81770f70-1b5b-450a-be9e-012569d256a6";
const FOLDER_ID = "f1c528b7-cfc6-4fe6-b5c2-9b536434a6fd";

beforeEach(() => {
  vi.clearAllMocks();
  taskApi.getTask.mockResolvedValue(taskDetail(1));
  taskApi.listTasks.mockResolvedValue(emptyTaskPage());
  taskApi.listTerminalTasks.mockResolvedValue(emptyTaskPage());
  taskApi.searchTasks.mockResolvedValue({ items: [], nextCursor: null });
  organizerApi.listFolders.mockResolvedValue({ items: [], nextCursor: null });
  organizerApi.listRegularLists.mockResolvedValue({ items: [], nextCursor: null });
  organizerApi.listSections.mockResolvedValue({ items: [], nextCursor: null });
  tagApi.listTags.mockResolvedValue({ items: [], nextCursor: null });
  occurrenceApi.getTaskOccurrence.mockResolvedValue(occurrence(1));
  occurrenceApi.transitionTaskOccurrence.mockResolvedValue(commandResult(1, 2));
});

describe("task query hooks", () => {
  it("loads root open tasks in bounded pages and appends the next cursor", async () => {
    const firstPage: TaskPage = { items: [task()], nextCursor: "next-page" };
    taskApi.listTasks.mockResolvedValueOnce(firstPage).mockResolvedValueOnce(emptyTaskPage());
    const { result } = renderHook(() => useTaskListQuery(LIST_ID), { wrapper: queryWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.tasks).toEqual(firstPage.items);
    expect(taskApi.listTasks).toHaveBeenNthCalledWith(1, {
      listId: LIST_ID,
      parentTaskId: null,
      status: "open",
      limit: 50,
    });

    await act(() => result.current.fetchNextPage());

    expect(taskApi.listTasks).toHaveBeenNthCalledWith(2, {
      listId: LIST_ID,
      parentTaskId: null,
      status: "open",
      limit: 50,
      cursor: "next-page",
    });
  });

  it("does not issue a server search for whitespace-only input", () => {
    const { result } = renderHook(() => useTaskSearchQuery("   "), { wrapper: queryWrapper() });

    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.results).toEqual([]);
    expect(taskApi.searchTasks).not.toHaveBeenCalled();
  });

  it("promotes a newer server task snapshot over a still-fresh cached copy", async () => {
    const client = queryClient();
    client.setQueryData(taskQueryKeys.detail(TASK_ID), taskDetail(4));

    const { result } = renderHook(() => useTaskDetailQuery(TASK_ID, taskDetail(5)), {
      wrapper: queryWrapper(client),
    });

    expect(result.current.data?.version).toBe(5);
    await waitFor(() =>
      expect(client.getQueryData<TaskDetailDto>(taskQueryKeys.detail(TASK_ID))?.version).toBe(5),
    );
    expect(taskApi.getTask).not.toHaveBeenCalled();
  });

  it("promotes a newer server occurrence snapshot over a still-fresh cached copy", async () => {
    const client = queryClient();
    const queryKey = taskOccurrenceQueryKey(TASK_ID, "o1.current");
    client.setQueryData(queryKey, occurrence(4));

    const { result } = renderHook(() => useTaskOccurrenceQuery(TASK_ID, "o1.current", occurrence(5)), {
      wrapper: queryWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.data?.taskVersion).toBe(5);
      expect(client.getQueryData<TaskOccurrenceDto>(queryKey)?.taskVersion).toBe(5);
    });
    expect(occurrenceApi.getTaskOccurrence).not.toHaveBeenCalled();
  });

  it("restores a valid server occurrence over cached null without resurrecting it after same-mount refetch", async () => {
    const client = queryClient();
    const queryKey = taskOccurrenceQueryKey(TASK_ID, "o1.current");
    client.setQueryData(queryKey, null);
    const initial = occurrence(5);
    const { rerender, result } = renderHook(
      ({ serverOccurrence }) => useTaskOccurrenceQuery(TASK_ID, "o1.current", serverOccurrence),
      {
        initialProps: { serverOccurrence: initial },
        wrapper: queryWrapper(client),
      },
    );

    await waitFor(() => {
      expect(result.current.data?.taskVersion).toBe(5);
      expect(client.getQueryData<TaskOccurrenceDto>(queryKey)?.taskVersion).toBe(5);
    });

    occurrenceApi.getTaskOccurrence.mockResolvedValueOnce(null);
    await act(() => result.current.refetch());
    await waitFor(() => {
      expect(result.current.data).toBeNull();
      expect(client.getQueryData(queryKey)).toBeNull();
    });

    rerender({ serverOccurrence: occurrence(6) });
    await waitFor(() => {
      expect(result.current.data?.taskVersion).toBe(6);
      expect(client.getQueryData<TaskOccurrenceDto>(queryKey)?.taskVersion).toBe(6);
    });
  });

  it.each([
    ["complete", "completed"],
    ["skip", "skipped"],
    ["undo", "open"],
  ] as const)("advances the recurrence version token after an adjacent %s", async (action, state) => {
    const client = queryClient();
    const occurrenceKey = taskOccurrenceQueryKey(TASK_ID, "o1.current");
    const recurrenceKey = taskRecurrenceQueryKey(TASK_ID);
    const onApplied = vi.fn();
    client.setQueryData(taskQueryKeys.detail(TASK_ID), taskDetail(4));
    client.setQueryData(occurrenceKey, occurrence(4));
    client.setQueryData(recurrenceKey, recurrence(4));
    occurrenceApi.transitionTaskOccurrence.mockResolvedValueOnce({
      ...commandResult(4, 5),
      action,
      occurrenceState: state,
    });
    const { result } = renderHook(() => useTaskOccurrenceMutation(TASK_ID, "o1.current", onApplied), {
      wrapper: queryWrapper(client),
    });

    await act(() =>
      result.current.mutateAsync({
        action,
        occurrenceKey: "o1.current",
        expectedVersion: 4,
      }),
    );

    expect(client.getQueryData<TaskRecurrenceDto>(recurrenceKey)?.taskVersion).toBe(5);
    expect(client.getQueryData<TaskOccurrenceDto>(occurrenceKey)).toMatchObject({
      occurrenceState: state,
      taskVersion: 5,
    });
    expect(client.getQueryState(recurrenceKey)?.isInvalidated).toBe(true);
    expect(onApplied).toHaveBeenCalledOnce();
  });

  it("does not fabricate task or occurrence snapshots from an ahead idempotent retry", async () => {
    const client = queryClient();
    const queryKey = taskOccurrenceQueryKey(TASK_ID, "o1.current");
    const recurrenceKey = taskRecurrenceQueryKey(TASK_ID);
    const onApplied = vi.fn();
    client.setQueryData(taskQueryKeys.detail(TASK_ID), taskDetail(4));
    client.setQueryData(queryKey, occurrence(4));
    client.setQueryData(recurrenceKey, recurrence(4));
    occurrenceApi.transitionTaskOccurrence.mockResolvedValueOnce({
      ...commandResult(4, 8),
      outcome: "idempotent_retry",
    });
    const { result } = renderHook(() => useTaskOccurrenceMutation(TASK_ID, "o1.current", onApplied), {
      wrapper: queryWrapper(client),
    });

    await act(() =>
      result.current.mutateAsync({
        action: "complete",
        occurrenceKey: "o1.current",
        expectedVersion: 4,
      }),
    );

    expect(client.getQueryData<TaskDetailDto>(taskQueryKeys.detail(TASK_ID))?.version).toBe(4);
    expect(client.getQueryData<TaskOccurrenceDto>(queryKey)).toMatchObject({
      occurrenceState: "open",
      taskVersion: 4,
    });
    expect(client.getQueryData<TaskRecurrenceDto>(recurrenceKey)?.taskVersion).toBe(4);
    expect(client.getQueryState(recurrenceKey)?.isInvalidated).toBe(true);
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("invalidates recurrence after an unconfirmed occurrence write while retaining the exact command", async () => {
    const client = queryClient();
    const recurrenceKey = taskRecurrenceQueryKey(TASK_ID);
    const request = {
      action: "skip",
      occurrenceKey: "o1.current",
      expectedVersion: 4,
    } as const;
    client.setQueryData(recurrenceKey, recurrence(4));
    occurrenceApi.transitionTaskOccurrence.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useTaskOccurrenceMutation(TASK_ID, "o1.current", vi.fn()), {
      wrapper: queryWrapper(client),
    });

    await act(async () => {
      await expect(result.current.mutateAsync(request)).rejects.toThrow("Failed to fetch");
    });

    expect(client.getQueryState(recurrenceKey)?.isInvalidated).toBe(true);
    await waitFor(() => expect(result.current.variables).toEqual(request));
  });
});

describe("organizer query hooks", () => {
  it("keeps folder reads bounded and follows the server cursor", async () => {
    const firstPage: FolderPage = {
      items: [
        {
          id: FOLDER_ID,
          name: "Work",
          rank: "a",
          version: 1,
          createdAt: "2026-07-19T00:00:00.000Z",
          updatedAt: "2026-07-19T00:00:00.000Z",
          deletedAt: null,
        },
      ],
      nextCursor: "next-folder-page",
    };
    organizerApi.listFolders
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    const { result } = renderHook(() => useFoldersQuery(), { wrapper: queryWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.folders).toEqual(firstPage.items);
    expect(organizerApi.listFolders).toHaveBeenNthCalledWith(1, undefined);

    await act(() => result.current.fetchNextPage());

    expect(organizerApi.listFolders).toHaveBeenNthCalledWith(2, "next-folder-page");
  });
});

function queryWrapper(client = queryClient()) {
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function queryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 15_000 } },
  });
}

function emptyTaskPage(): TaskPage {
  return { items: [], nextCursor: null };
}

function task(): TaskListItemDto {
  return {
    id: TASK_ID,
    listId: LIST_ID,
    sectionId: null,
    parentTaskId: null,
    title: "Prepare demo",
    descriptionMd: "",
    status: "open",
    priority: "high",
    rank: "a",
    statusChangedAt: "2026-07-19T00:00:00.000Z",
    tags: [],
    recurrence: null,
    version: 1,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    deletedAt: null,
  };
}

function taskDetail(version: number): TaskDetailDto {
  return {
    ...task(),
    version,
    checklistItems: [],
    subtasks: [],
  };
}

function occurrence(taskVersion: number): TaskOccurrenceDto {
  return {
    taskId: TASK_ID,
    taskVersion,
    occurrenceKey: "o1.current",
    occurrenceState: taskVersion === 5 ? "completed" : "open",
    transitionEligible: true,
    schedule: { kind: "all_day", startDate: "2026-07-20", endDate: "2026-07-21" },
  };
}

function recurrence(taskVersion: number): TaskRecurrenceDto {
  return {
    taskId: TASK_ID,
    taskVersion,
    generationMode: "schedule",
    timezone: "Asia/Singapore",
    definition: { preset: { kind: "daily", interval: 1 }, end: { kind: "never" } },
    cutover: {
      kind: "all_day",
      projectionStartDate: "2026-07-20",
      projectionEndDate: null,
    },
    lifecycle: "active",
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
  };
}

function commandResult(expectedVersion: number, taskVersion: number) {
  return {
    outcome: "applied" as const,
    action: "complete" as const,
    occurrenceKey: "o1.current",
    expectedVersion,
    task: { id: TASK_ID, version: taskVersion },
    occurrenceState: "completed" as const,
    eventTaskVersion: expectedVersion + 1,
  };
}
