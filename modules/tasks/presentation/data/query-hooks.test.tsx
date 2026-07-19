import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FolderPage, TaskListItemDto, TaskPage } from "../../application/contracts";

import { useFoldersQuery } from "./use-organizer-queries";
import { useTaskListQuery, useTaskSearchQuery } from "./use-task-queries";

const taskApi = vi.hoisted(() => ({
  getTask: vi.fn(),
  listTasks: vi.fn(),
  listTerminalTasks: vi.fn(),
  searchTasks: vi.fn(),
}));
const organizerApi = vi.hoisted(() => ({
  listFolders: vi.fn(),
  listRegularLists: vi.fn(),
  listSections: vi.fn(),
}));
const tagApi = vi.hoisted(() => ({ listTags: vi.fn() }));

vi.mock("./task-api-client", () => taskApi);
vi.mock("./organizer-api-client", () => organizerApi);
vi.mock("./tag-api-client", () => tagApi);

const TASK_ID = "0da6e6d9-2cf0-47cc-b869-964b6e91c3c0";
const LIST_ID = "81770f70-1b5b-450a-be9e-012569d256a6";
const FOLDER_ID = "f1c528b7-cfc6-4fe6-b5c2-9b536434a6fd";

beforeEach(() => {
  vi.clearAllMocks();
  taskApi.listTasks.mockResolvedValue(emptyTaskPage());
  taskApi.listTerminalTasks.mockResolvedValue(emptyTaskPage());
  taskApi.searchTasks.mockResolvedValue({ items: [], nextCursor: null });
  organizerApi.listFolders.mockResolvedValue({ items: [], nextCursor: null });
  organizerApi.listRegularLists.mockResolvedValue({ items: [], nextCursor: null });
  organizerApi.listSections.mockResolvedValue({ items: [], nextCursor: null });
  tagApi.listTags.mockResolvedValue({ items: [], nextCursor: null });
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

function queryWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
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
    version: 1,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    deletedAt: null,
  };
}
